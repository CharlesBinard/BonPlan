// packages/scraper/src/scrape.ts

import type { AiContext, Config } from "@bonplan/shared";
import { createLogger, publish, Stream, searches, subscribe } from "@bonplan/shared";
import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import type { BrowserContext } from "patchright-core";
import { createPage, getOrCreateConnection, navigateWithRetry, randomDelay } from "./browser/browser";
import { dismissCookieConsent } from "./browser/cookie-consent";
import { insertNewListings, updateLastScraped } from "./db/dedup";
import {
	checkForBlock,
	parseNextDataWithPagination,
	parseXhrAds,
	type RawListing,
	saveSnapshot,
} from "./parsing/parser";
import { ensureListView } from "./parsing/url-helper";
import { setupXhrInterceptor } from "./parsing/xhr-interceptor";

const logger = createLogger("scraper");

// Max pages to scrape per URL (avoid excessive requests)
const MAX_PAGES = 3;

type Db = ReturnType<typeof import("@bonplan/shared")["createDb"]>["db"];

type ScrapeDeps = {
	db: Db;
	redis: Redis;
	config: Config;
};

let cookieConsentDone = false;

/** Scrape a single page URL and return listings + pagination info */
const scrapeSinglePage = async (
	context: BrowserContext,
	url: string,
	searchId: string,
	deps: ScrapeDeps,
	userId: string,
): Promise<{ listings: RawListing[]; maxPages: number; blocked: boolean }> => {
	const page = await createPage(context);
	const xhr = setupXhrInterceptor(page);

	try {
		// Cookie consent — once per browser session
		if (!cookieConsentDone) {
			const { blocked, reason } = await navigateWithRetry(page, url);
			if (blocked) {
				await handleBlock(deps, searchId, userId, reason);
				return { listings: [], maxPages: 1, blocked: true };
			}
			await dismissCookieConsent(page);
			cookieConsentDone = true;
		} else {
			await randomDelay(2000, 5000);
			const { blocked, reason } = await navigateWithRetry(page, url);
			if (blocked) {
				await handleBlock(deps, searchId, userId, reason);
				return { listings: [], maxPages: 1, blocked: true };
			}
		}

		// Wait for content to settle
		await randomDelay(1000, 3000);

		// Strategy 1: XHR intercepted API response
		const xhrResult = xhr.getAds();
		if (xhrResult) {
			const listings = parseXhrAds(xhrResult.ads);
			logger.info("Extracted from XHR", { searchId, url: url.substring(0, 80), count: listings.length });
			return { listings, maxPages: 1, blocked: false }; // XHR doesn't give us maxPages easily
		}

		// Strategy 2: HTML __NEXT_DATA__
		const html = await page.content();
		const pageTitle = await page.title();

		const blockCheck = checkForBlock(html, null, pageTitle);
		if (blockCheck.blocked) {
			await handleBlock(deps, searchId, userId, blockCheck.reason);
			return { listings: [], maxPages: 1, blocked: true };
		}

		const result = parseNextDataWithPagination(html);

		if (result.listings.length === 0) {
			const hasContent = html.includes("__NEXT_DATA__") || html.length > 5000;
			if (hasContent) {
				saveSnapshot(html, searchId);
			}
		}

		return { listings: result.listings, maxPages: result.maxPages, blocked: false };
	} finally {
		xhr.cleanup();
		await page.close();
	}
};

const performScrape = async (deps: ScrapeDeps, searchId: string, userId: string): Promise<void> => {
	const [search] = await deps.db.select().from(searches).where(eq(searches.id, searchId));

	if (!search?.aiContext) {
		logger.warn("Search not found or no AI context", { searchId });
		await publish(deps.redis, Stream.SearchError, {
			searchId,
			userId,
			source: "scraper",
			error: "No AI context found for search",
			errorType: "missing_ai_context",
		});
		return;
	}

	const aiContext = search.aiContext as unknown as AiContext & { searchUrl?: string };
	const searchUrls = aiContext.searchUrls ?? (aiContext.searchUrl ? [aiContext.searchUrl] : []);
	if (searchUrls.length === 0) {
		logger.warn("Search has no searchUrls in aiContext", { searchId });
		await publish(deps.redis, Stream.SearchError, {
			searchId,
			userId,
			source: "scraper",
			error: "No search URLs found in AI context",
			errorType: "missing_search_urls",
		});
		return;
	}

	const conn = await getOrCreateConnection(deps.config.browserWsUrl ?? "ws://localhost:9222");
	if (conn.isNew) {
		cookieConsentDone = false;
	}

	const allListings: RawListing[] = [];

	for (let i = 0; i < searchUrls.length; i++) {
		const rawUrl = searchUrls[i] as string;
		const baseUrl = ensureListView(rawUrl);

		if (i > 0) {
			await randomDelay(2000, 4000);
		}

		// Scrape page 1
		const firstPage = await scrapeSinglePage(conn.context, baseUrl, searchId, deps, userId);
		if (firstPage.blocked) return;
		allListings.push(...firstPage.listings);

		// Paginate: only on the first URL (most specific keyword) to avoid noise multiplication
		if (i === 0 && firstPage.maxPages > 1) {
			const pagesToScrape = Math.min(firstPage.maxPages, MAX_PAGES);
			logger.info("Paginating", { searchId, maxPages: firstPage.maxPages, scraping: pagesToScrape });

			for (let pageNum = 2; pageNum <= pagesToScrape; pageNum++) {
				await randomDelay(2000, 5000);
				const paginatedUrl = new URL(baseUrl);
				paginatedUrl.searchParams.set("page", String(pageNum));
				const pageUrl = paginatedUrl.toString();
				const pageResult = await scrapeSinglePage(conn.context, pageUrl, searchId, deps, userId);
				if (pageResult.blocked) return;
				allListings.push(...pageResult.listings);

				if (pageResult.listings.length === 0) {
					logger.info("Empty page, stopping pagination", { searchId, pageNum });
					break;
				}
			}
		}
	}

	// Deduplicate across all URLs and pages by lbcId
	const seen = new Set<string>();
	const dedupedListings = allListings.filter((l) => {
		if (seen.has(l.lbcId)) return false;
		seen.add(l.lbcId);
		return true;
	});

	if (dedupedListings.length === 0) {
		logger.info("No listings found", { searchId });
		await updateLastScraped(deps.db, searchId);
		return;
	}

	// Enrich listings that have no description by fetching individual ad pages
	// Uses lightweight pages (no images/CSS) with parallel tabs for speed
	const needsDescription = dedupedListings.filter((l) => !l.description && l.url);
	if (needsDescription.length > 0) {
		const toEnrich = needsDescription.slice(0, 5);
		logger.info("Enriching descriptions", { searchId, count: toEnrich.length, total: needsDescription.length });

		let enriched = 0;
		let blocked = false;

		for (const listing of toEnrich) {
			if (blocked) break;

			await randomDelay(3000, 6000);
			const page = await createPage(conn.context);
			try {
				const { blocked: navBlocked } = await navigateWithRetry(page, listing.url, 2);
				if (navBlocked) {
					blocked = true;
					break;
				}

				const html = await page.content();
				const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
				if (match?.[1]) {
					const data = JSON.parse(match[1]) as Record<string, unknown>;
					const pageProps = (data.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
					const ad = pageProps?.ad as Record<string, unknown> | undefined;
					const body = ad?.body;
					if (typeof body === "string" && body.length > 0) {
						listing.description = body;
						enriched++;
					}
				}
			} catch (err) {
				logger.warn("Description enrichment error", {
					url: listing.url,
					error: err instanceof Error ? err.message : String(err),
				});
			} finally {
				await page.close();
			}
		}

		logger.info("Enrichment done", { searchId, enriched, attempted: toEnrich.length, blocked });
	}

	const newListings = await insertNewListings(deps.db, searchId, userId, dedupedListings);
	if (newListings.length > 0) {
		await publish(deps.redis, Stream.ListingsFound, {
			searchId,
			userId,
			listingIds: newListings.map((l) => l.id),
		});
	}
	await updateLastScraped(deps.db, searchId);
	logger.info("Scrape completed", {
		searchId,
		urlsScraped: searchUrls.length,
		totalParsed: dedupedListings.length,
		newListings: newListings.length,
	});
};

const handleBlock = async (deps: ScrapeDeps, searchId: string, userId: string, reason: string): Promise<void> => {
	await publish(deps.redis, Stream.SearchBlocked, {
		searchId,
		userId,
		reason,
		retryAfter: 1800,
	});
	await updateLastScraped(deps.db, searchId, reason);
	logger.warn("Scrape blocked", { searchId, reason });
};

// ── Event consumer ─────────────────────────────────────────────────

export const startScrapeConsumer = async (deps: ScrapeDeps): Promise<{ stop: () => void }> => {
	const consumerId = `scraper-${process.pid}`;

	const sub = await subscribe(
		deps.redis,
		Stream.SearchTrigger,
		"scraper",
		consumerId,
		async (payload) => {
			try {
				await performScrape(deps, payload.searchId, payload.userId);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				logger.error("Scrape failed", { searchId: payload.searchId, error: error.message });

				await publish(deps.redis, Stream.SearchError, {
					searchId: payload.searchId,
					userId: payload.userId,
					source: "scraper",
					error: error.message,
					errorType: "scrape_failed",
				});
				await updateLastScraped(deps.db, payload.searchId, error.message);
			}
		},
		{ logger, serviceName: "scraper" },
	);

	return sub;
};

// packages/analyzer/src/market-research.ts

import { type createDb, createLogger, listings } from "@bonplan/shared";
import { and, desc, ilike, lt } from "drizzle-orm";
import type Redis from "ioredis";

const logger = createLogger("analyzer");

// ── Types ────────────────────────────────────────────────────────

export type Comparable = {
	title: string;
	price: number; // cents
	source: string; // "backmarket.fr" | "rakuten.com" | "bonplan-history" | "searxng"
	date?: string; // ISO date
};

export type MarketResearchResult = {
	context: string; // Formatted text for AI prompt
	comparables: Comparable[]; // Structured data for storage (cents)
	median: number | null; // Median price in cents
};

// ── Utilities ────────────────────────────────────────────────────

/** Compute the median of an array of numbers. Returns null for empty arrays. */
export const computeMedian = (values: number[]): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 !== 0) return sorted[mid]!;
	return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

/**
 * Extract the first EUR price from a text string. Returns price in cents or null.
 * Handles European formats: 699€, 1 299€, 1.299€, 1.299,00€, 12,50€, 12.50€
 */
export const extractPrice = (text: string): number | null => {
	const match = text.match(/(\d[\d\s.]*(?:,\d{1,2})?)\s*€/);
	if (!match?.[1]) return null;

	let raw = match[1].replace(/\s/g, "");

	if (raw.includes(",")) {
		// Comma present → dots are thousands separators: "1.299,00" → "1299.00"
		raw = raw.replace(/\./g, "").replace(",", ".");
	} else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
		// Dot-separated groups of 3 = thousands separator: "1.299" → "1299"
		raw = raw.replace(/\./g, "");
	}
	// Otherwise dot is decimal: "12.50" stays "12.50"

	const euros = Number.parseFloat(raw);
	return Number.isNaN(euros) ? null : Math.round(euros * 100);
};

/**
 * Compute discount percentage. Positive = below market, negative = above market.
 * Returns null if median is unavailable or zero.
 */
export const computeDiscount = (listingPrice: number, marketMedian: number | null): number | null => {
	if (marketMedian === null || marketMedian <= 0) return null;
	return Math.round((1 - listingPrice / marketMedian) * 100);
};

/** Parse SearXNG results into structured Comparables by extracting prices. */
export const parseSearxngComparables = (
	results: Array<{ title: string; content: string }>,
	source: string,
): Comparable[] => {
	const comparables: Comparable[] = [];
	for (const r of results) {
		const price = extractPrice(r.content) ?? extractPrice(r.title);
		if (price !== null) {
			comparables.push({ title: r.title, price, source });
		}
	}
	return comparables;
};

/** Build a SearXNG query scoped to a specific site. */
export const buildSiteQuery = (query: string, site: string): string => {
	return `${query} site:${site}`;
};

/** Escape LIKE/ILIKE special characters to prevent wildcard injection. */
export const escapeLike = (s: string): string => s.replace(/[%_\\]/g, "\\$&");

export const CACHE_TTL_SECONDS = 86400; // 24 hours
const CACHE_PREFIX = "market-research:";

/** Build multiple query variants for better price coverage */
export const buildMarketQueries = (searchQuery: string): string[] => {
	return [`${searchQuery} prix occasion`, `"${searchQuery}" prix reconditionné`, `${searchQuery} tarif argus occasion`];
};

/** Fetch from SearXNG with a single query */
const fetchSearxng = async (searxngUrl: string, query: string): Promise<Array<{ title: string; content: string }>> => {
	const url = new URL("/search", searxngUrl);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	url.searchParams.set("categories", "general");
	url.searchParams.set("language", "fr");

	const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
	if (!response.ok) return [];

	const text = await response.text();
	let data: { results?: Array<{ title?: string; content?: string }> };
	try {
		data = JSON.parse(text);
	} catch {
		// SearXNG sometimes returns broken JSON (debug format) — try to extract results with regex
		const results: Array<{ title: string; content: string }> = [];
		const titleMatches = text.matchAll(/"title":\s*"([^"]+)"/g);
		const contentMatches = [...text.matchAll(/"content":\s*"([^"]+)"/g)];
		let i = 0;
		for (const m of titleMatches) {
			const content = contentMatches[i]?.[1] ?? "";
			if (m[1]) results.push({ title: m[1], content });
			i++;
			if (results.length >= 8) break;
		}
		return results;
	}

	if (!data.results) return [];

	return data.results
		.filter((r) => r.title && r.content)
		.map((r) => ({ title: r.title as string, content: r.content as string }));
};

// ── Internal Price History ──────────────────────────────────────

type Db = ReturnType<typeof createDb>["db"];

/** Fetch "sold" listings (not re-scraped in 48h) matching the query as comparables. */
export const fetchInternalHistory = async (db: Db, query: string): Promise<Comparable[]> => {
	const keywords = query
		.toLowerCase()
		.trim()
		.split(/\s+/)
		.filter((k) => k.length > 2);

	if (keywords.length === 0) return [];

	const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

	// Escape LIKE wildcards to prevent pattern injection, then build ILIKE pattern
	const pattern = `%${keywords.map(escapeLike).join("%")}%`;

	try {
		const rows = await db
			.select({
				title: listings.title,
				price: listings.price,
				updatedAt: listings.updatedAt,
			})
			.from(listings)
			.where(and(ilike(listings.title, pattern), lt(listings.updatedAt, cutoff)))
			.orderBy(desc(listings.updatedAt))
			.limit(10);

		return rows.map((r) => ({
			title: r.title,
			price: r.price, // already in cents
			source: "bonplan-history",
			date: r.updatedAt.toISOString(),
		}));
	} catch (err) {
		logger.warn("Internal history fetch failed", { query, error: err instanceof Error ? err.message : String(err) });
		return [];
	}
};

// ── Context String Builder ──────────────────────────────────────

/** Build a formatted market context string for the AI prompt. */
export const buildMarketContextString = (
	searchQuery: string,
	comparables: Comparable[],
	median: number | null,
): string => {
	const lines: string[] = [`Comparables trouvés pour "${searchQuery}" :`];

	const bySource: Record<string, Comparable[]> = {};
	for (const c of comparables) {
		(bySource[c.source] ??= []).push(c);
	}

	for (const [source, items] of Object.entries(bySource)) {
		for (const item of items.slice(0, 3)) {
			const priceEur = Math.round(item.price / 100);
			lines.push(`- ${source}: "${item.title}" → ${priceEur}€`);
		}
	}

	if (median !== null) {
		lines.push("", `Prix médian occasion estimé : ${Math.round(median / 100)}€`);
	}

	lines.push(
		"",
		"Note: Les prix affichés sont des prix demandés. Les prix de transaction réels sont généralement 10-20% inférieurs sur LeBonCoin.",
	);

	return lines.join("\n");
};

export const fetchMarketContext = async (
	redis: Redis,
	db: Db,
	searchQuery: string,
	searxngUrl: string | undefined,
): Promise<MarketResearchResult | null> => {
	const cacheKey = `${CACHE_PREFIX}${searchQuery.toLowerCase().trim().replace(/\s+/g, " ")}`;

	// Check cache (stores JSON since v2 — validate structure)
	const cached = await redis.get(cacheKey);
	if (cached) {
		try {
			const parsed = JSON.parse(cached);
			if (parsed && typeof parsed === "object" && "context" in parsed && "comparables" in parsed) {
				logger.info("Market research cache hit", { query: searchQuery });
				return parsed as MarketResearchResult;
			}
			// Old format (plain string) or invalid — refetch
		} catch {
			// Corrupted cache — refetch
		}
	}

	try {
		// Fetch all 3 source groups in parallel for minimal latency
		const [siteResults, genericResults, internalComparables] = await Promise.all([
			// 1. Site-scoped SearXNG (BackMarket, Rakuten)
			searxngUrl
				? Promise.all(
						["backmarket.fr", "rakuten.com"].map(async (site) => {
							try {
								const results = await fetchSearxng(searxngUrl, buildSiteQuery(searchQuery, site));
								return parseSearxngComparables(results, site);
							} catch {
								return [];
							}
						}),
					)
				: Promise.resolve([] as Comparable[][]),

			// 2. Generic SearXNG queries
			searxngUrl
				? Promise.all(buildMarketQueries(searchQuery).map((q) => fetchSearxng(searxngUrl, q)))
				: Promise.resolve([] as Array<Array<{ title: string; content: string }>>),

			// 3. Internal price history (sold listings)
			fetchInternalHistory(db, searchQuery),
		]);

		const allComparables: Comparable[] = [];

		// Add site-scoped results
		allComparables.push(...siteResults.flat());

		// Add generic results with deduplication
		const seen = new Set<string>(allComparables.map((c) => c.title.toLowerCase().trim()));
		for (const results of genericResults) {
			for (const c of parseSearxngComparables(results, "searxng")) {
				const key = c.title.toLowerCase().trim();
				if (!seen.has(key)) {
					seen.add(key);
					allComparables.push(c);
				}
			}
		}

		// Add internal history
		allComparables.push(...internalComparables);

		if (allComparables.length === 0) return null;

		const median = computeMedian(allComparables.map((c) => c.price));
		const context = buildMarketContextString(searchQuery, allComparables, median);

		const result: MarketResearchResult = { context, comparables: allComparables, median };

		// Cache for 24 hours
		await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
		logger.info("Market research fetched and cached", { query: searchQuery, resultCount: allComparables.length });

		return result;
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.warn("Market research failed", { query: searchQuery, error: error.message });
		return null;
	}
};

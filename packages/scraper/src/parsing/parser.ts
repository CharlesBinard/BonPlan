// packages/scraper/src/parser.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@bonplan/shared";

const logger = createLogger("scraper");

export type RawListing = {
	lbcId: string;
	title: string;
	price: number; // in cents (EUR * 100)
	description: string;
	images: string[];
	url: string;
	sellerType: "pro" | "particulier";
	location: string;
	rawData: Record<string, unknown>;
};

// ── Primary: __NEXT_DATA__ extraction ──────────────────────────────
// Path: props.pageProps.searchData.ads (current)
//   or: props.pageProps.initialProps.searchData.ads (legacy fallback)

export type ParseResult = {
	listings: RawListing[];
	maxPages: number;
	total: number;
};

export const parseNextData = (html: string): RawListing[] => {
	return parseNextDataWithPagination(html).listings;
};

export const parseNextDataWithPagination = (html: string): ParseResult => {
	const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
	if (!match?.[1]) return { listings: [], maxPages: 1, total: 0 };

	try {
		const data = JSON.parse(match[1]) as Record<string, unknown>;
		const searchData = extractSearchData(data);
		if (!searchData || !Array.isArray(searchData.ads)) return { listings: [], maxPages: 1, total: 0 };
		const ads = searchData.ads;

		const listings = ads
			.map((ad) => parseAd(ad as Record<string, unknown>))
			.filter((listing): listing is RawListing => listing !== null);

		const maxPages = typeof searchData.max_pages === "number" ? searchData.max_pages : 1;
		const total = typeof searchData.total === "number" ? searchData.total : listings.length;

		return { listings, maxPages, total };
	} catch {
		logger.warn("Failed to parse __NEXT_DATA__ JSON");
		return { listings: [], maxPages: 1, total: 0 };
	}
};

const extractSearchData = (data: Record<string, unknown>): Record<string, unknown> | null => {
	try {
		const props = data.props as Record<string, unknown> | undefined;
		const pageProps = props?.pageProps as Record<string, unknown> | undefined;

		// Try direct path first (current LBC structure: pageProps.searchData)
		const searchDataDirect = pageProps?.searchData as Record<string, unknown> | undefined;
		if (searchDataDirect?.ads) return searchDataDirect;

		// Fallback: legacy path (pageProps.initialProps.searchData)
		const initialProps = pageProps?.initialProps as Record<string, unknown> | undefined;
		const searchDataLegacy = initialProps?.searchData as Record<string, unknown> | undefined;
		if (searchDataLegacy?.ads) return searchDataLegacy;

		return null;
	} catch {
		return null;
	}
};

const parseAd = (ad: Record<string, unknown>): RawListing | null => {
	try {
		const listId = ad.list_id;
		const subject = ad.subject;
		if (typeof listId !== "number" || typeof subject !== "string") return null;

		// Price: use price_cents if available (already in cents), otherwise price[0] * 100
		const priceCents = typeof ad.price_cents === "number" ? ad.price_cents : null;
		const priceArr = ad.price as number[] | undefined;
		const price = priceCents ?? (priceArr?.[0] ?? 0) * 100;

		const body = typeof ad.body === "string" ? ad.body : "";
		const url = typeof ad.url === "string" ? ad.url : "";

		const images = ad.images as Record<string, unknown> | undefined;
		const imageUrls = Array.isArray(images?.urls) ? (images.urls as string[]) : [];

		const owner = ad.owner as Record<string, unknown> | undefined;
		const ownerType = owner?.type;
		let sellerType: "pro" | "particulier";
		if (ownerType === "pro") {
			sellerType = "pro";
		} else {
			if (ownerType !== "private" && ownerType !== undefined && ownerType !== null) {
				logger.warn("Unknown seller type, defaulting to particulier", { ownerType, listId });
			}
			sellerType = "particulier";
		}

		const location = ad.location as Record<string, unknown> | undefined;
		const city = typeof location?.city === "string" ? location.city : "Inconnu";

		return {
			lbcId: String(listId),
			title: subject,
			price,
			description: body,
			images: imageUrls,
			url,
			sellerType,
			location: city,
			rawData: ad,
		};
	} catch {
		return null;
	}
};

export const parseXhrAds = (ads: unknown[]): RawListing[] => {
	return ads
		.map((ad) => parseAd(ad as Record<string, unknown>))
		.filter((listing): listing is RawListing => listing !== null);
};

// ── Block detection (consolidated — single source of truth) ────────

export type BlockCheck = {
	blocked: boolean;
	reason: string;
};

export const checkForBlock = (html: string, statusCode: number | null, pageTitle: string): BlockCheck => {
	if (statusCode === 403) return { blocked: true, reason: "HTTP 403 Forbidden" };
	if (statusCode === 429) return { blocked: true, reason: "HTTP 429 Too Many Requests" };
	if (statusCode === 503 && html.includes("challenge")) return { blocked: true, reason: "HTTP 503 Challenge" };

	const titleLower = pageTitle.toLowerCase();
	if (titleLower.includes("verification") || titleLower.includes("captcha") || titleLower.includes("robot")) {
		return { blocked: true, reason: "Captcha/verification page detected" };
	}

	if (html.includes("captcha-container") || html.includes("captcha-delivery") || html.includes("datadome")) {
		return { blocked: true, reason: "DataDome/captcha element detected" };
	}

	return { blocked: false, reason: "" };
};

// ── HTML snapshot ──────────────────────────────────────────────────

const SNAPSHOT_DIR = process.env.PARSER_SNAPSHOT_DIR ?? "./parser-snapshots";

export const saveSnapshot = (html: string, searchId: string): string => {
	mkdirSync(SNAPSHOT_DIR, { recursive: true });
	const filename = `${searchId}-${Date.now()}.html`;
	const filepath = join(SNAPSHOT_DIR, filename);
	writeFileSync(filepath, html);
	logger.info("HTML snapshot saved", { filepath, searchId });
	return filepath;
};

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

export const fetchMarketContext = async (
	redis: Redis,
	searchQuery: string,
	searxngUrl: string | undefined,
): Promise<string | null> => {
	if (!searxngUrl) return null;

	const cacheKey = `${CACHE_PREFIX}${searchQuery.toLowerCase().trim().replace(/\s+/g, " ")}`;

	// Check cache
	const cached = await redis.get(cacheKey);
	if (cached) {
		logger.info("Market research cache hit", { query: searchQuery });
		return cached;
	}

	try {
		const queries = buildMarketQueries(searchQuery);

		// Fetch all query variants in parallel
		const allResults = await Promise.all(queries.map((q) => fetchSearxng(searxngUrl, q)));

		// Deduplicate by title and take top 8 results
		const seen = new Set<string>();
		const uniqueResults: Array<{ title: string; content: string; query: string }> = [];

		for (let i = 0; i < allResults.length; i++) {
			const results = allResults[i] as Array<{ title: string; content: string }>;
			for (const result of results) {
				const key = result.title.toLowerCase().trim();
				if (!seen.has(key)) {
					seen.add(key);
					uniqueResults.push({ ...result, query: queries[i] as string });
				}
			}
		}

		if (uniqueResults.length === 0) return null;

		const top = uniqueResults.slice(0, 8);
		const context = [
			`Market research for "${searchQuery}" (${top.length} results from ${queries.length} queries):`,
			"",
			"Use these to estimate the fair market price. Remember: listed/asking prices are typically 10-20% above actual selling prices on LeBonCoin.",
			"",
			...top.map((r) => `- ${r.title}: ${r.content}`),
		].join("\n");

		// Cache for 1 hour
		await redis.set(cacheKey, context, "EX", CACHE_TTL_SECONDS);
		logger.info("Market research fetched and cached", { query: searchQuery, resultCount: top.length });

		return context;
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.warn("Market research failed", { query: searchQuery, error: error.message });
		return null;
	}
};

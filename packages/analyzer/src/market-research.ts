// packages/analyzer/src/market-research.ts

import { createLogger } from "@bonplan/shared";
import type Redis from "ioredis";

const logger = createLogger("analyzer");

export const CACHE_TTL_SECONDS = 3600; // 1 hour
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

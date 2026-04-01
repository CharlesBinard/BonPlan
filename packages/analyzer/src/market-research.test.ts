// packages/analyzer/src/market-research.test.ts
import { describe, expect, it } from "bun:test";
import { buildMarketQueries, CACHE_TTL_SECONDS } from "./market-research";

describe("market-research", () => {
	it("builds multiple market queries from search query", () => {
		const queries = buildMarketQueries("HDD 10To");
		expect(queries.length).toBeGreaterThanOrEqual(2);
		expect(queries[0]).toBe("HDD 10To prix occasion");
	});

	it("includes occasion and reconditionné variants", () => {
		const queries = buildMarketQueries("iPhone 15 Pro");
		expect(queries.some((q) => q.includes("occasion"))).toBe(true);
		expect(queries.some((q) => q.includes("reconditionné"))).toBe(true);
	});

	it("exports cache TTL constant", () => {
		expect(CACHE_TTL_SECONDS).toBe(3600);
	});
});

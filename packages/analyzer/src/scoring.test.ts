// packages/analyzer/src/scoring.test.ts
import { describe, expect, it } from "bun:test";
import { analysisResultSchema, normalizeMarketPrices } from "./scoring";

describe("analysisResultSchema", () => {
	it("parses valid analysis data", () => {
		const result = analysisResultSchema.safeParse({
			matchesQuery: true,
			score: 85,
			verdict: "Good deal, below market price",
			marketPriceLow: 13000,
			marketPriceHigh: 18000,
			redFlags: [],
			reasoning: "The listing matches the search criteria well.",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.score).toBe(85);
			expect(result.data.matchesQuery).toBe(true);
			expect(result.data.redFlags).toEqual([]);
			expect(result.data.listingType).toBe("STANDALONE");
		}
	});

	it("rejects score outside 0-100 range", () => {
		const result = analysisResultSchema.safeParse({
			matchesQuery: true,
			score: 150,
			verdict: "test",
			marketPriceLow: 100,
			marketPriceHigh: 200,
			redFlags: [],
			reasoning: "test",
		});
		expect(result.success).toBe(false);
	});

	it("returns error details for missing fields", () => {
		const result = analysisResultSchema.safeParse({ matchesQuery: true });
		expect(result.success).toBe(false);
	});

	it("rounds float scores to integers", () => {
		const result = analysisResultSchema.safeParse({
			matchesQuery: true,
			score: 72.5,
			verdict: "good",
			marketPriceLow: 130.5,
			marketPriceHigh: 180.99,
			redFlags: [],
			reasoning: "test",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.score).toBe(73);
			expect(result.data.marketPriceLow).toBe(131);
			expect(result.data.marketPriceHigh).toBe(181);
		}
	});

	it("defaults listingType to STANDALONE when omitted", () => {
		const result = analysisResultSchema.safeParse({
			matchesQuery: true,
			score: 70,
			verdict: "ok",
			marketPriceLow: 100,
			marketPriceHigh: 200,
			redFlags: [],
			reasoning: "ok",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.listingType).toBe("STANDALONE");
		}
	});

	it("accepts explicit listingType values", () => {
		const result = analysisResultSchema.safeParse({
			matchesQuery: false,
			score: 10,
			verdict: "system",
			marketPriceLow: null,
			marketPriceHigh: null,
			redFlags: [],
			reasoning: "full PC",
			listingType: "SYSTEM",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.listingType).toBe("SYSTEM");
		}
	});
});

describe("normalizeMarketPrices", () => {
	it("swaps marketPriceLow and marketPriceHigh when low > high", () => {
		const input = { marketPriceLow: 25000, marketPriceHigh: 15000, score: 75 };
		const result = normalizeMarketPrices(input);
		expect(result.marketPriceLow).toBe(15000);
		expect(result.marketPriceHigh).toBe(25000);
	});

	it("does not mutate the input object", () => {
		const input = { marketPriceLow: 25000, marketPriceHigh: 15000 };
		const result = normalizeMarketPrices(input);
		expect(input.marketPriceLow).toBe(25000);
		expect(input.marketPriceHigh).toBe(15000);
		expect(result).not.toBe(input);
	});

	it("returns the same object when no swap needed", () => {
		const input = { marketPriceLow: 100, marketPriceHigh: 200 };
		const result = normalizeMarketPrices(input);
		expect(result).toBe(input);
	});

	it("handles null values without swapping", () => {
		const input = { marketPriceLow: null, marketPriceHigh: 200 };
		const result = normalizeMarketPrices(input);
		expect(result.marketPriceLow).toBeNull();
		expect(result.marketPriceHigh).toBe(200);
		expect(result).toBe(input);
	});
});

import { describe, expect, it } from "bun:test";
import {
	buildMarketContextString,
	buildMarketQueries,
	buildSiteQuery,
	CACHE_TTL_SECONDS,
	computeDiscount,
	computeMedian,
	escapeLike,
	extractPrice,
	fetchInternalHistory,
	parseSearxngComparables,
	type Comparable,
} from "./market-research";

// ── Existing tests (preserved) ──────────────────────────────────

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

	it("exports cache TTL constant of 24h", () => {
		expect(CACHE_TTL_SECONDS).toBe(86400);
	});
});

// ── computeMedian ───────────────────────────────────────────────

describe("computeMedian", () => {
	it("returns null for empty array", () => {
		expect(computeMedian([])).toBeNull();
	});

	it("returns the single value for 1-element array", () => {
		expect(computeMedian([50000])).toBe(50000);
	});

	it("returns middle value for odd-length array", () => {
		expect(computeMedian([10000, 30000, 50000])).toBe(30000);
	});

	it("returns average of two middle values for even-length array", () => {
		expect(computeMedian([10000, 20000, 30000, 40000])).toBe(25000);
	});

	it("handles unsorted input", () => {
		expect(computeMedian([50000, 10000, 30000])).toBe(30000);
	});

	it("rounds to integer for even-length arrays", () => {
		expect(computeMedian([10000, 10001])).toBe(10001);
	});

	it("handles all identical values", () => {
		expect(computeMedian([500, 500, 500, 500])).toBe(500);
	});

	it("does not mutate the input array", () => {
		const input = [300, 100, 200];
		computeMedian(input);
		expect(input).toEqual([300, 100, 200]);
	});
});

// ── extractPrice ────────────────────────────────────────────────

describe("extractPrice", () => {
	it("extracts simple euro price", () => {
		expect(extractPrice("RTX 4090 à 699€")).toBe(69900);
	});

	it("extracts price with comma decimals", () => {
		expect(extractPrice("Prix: 12,50 €")).toBe(1250);
	});

	it("extracts price with dot decimals", () => {
		expect(extractPrice("Prix: 12.50€")).toBe(1250);
	});

	it("extracts price with space thousands separator", () => {
		expect(extractPrice("À partir de 1 299€")).toBe(129900);
	});

	it("extracts European format: dot thousands + comma decimals", () => {
		expect(extractPrice("MacBook Pro 1.299,00€")).toBe(129900);
	});

	it("extracts European format: dot thousands without decimals", () => {
		expect(extractPrice("Prix: 1.299€")).toBe(129900);
	});

	it("extracts large European format: multiple dot groups", () => {
		expect(extractPrice("Voiture 12.500€")).toBe(1250000);
	});

	it("returns null when no price found", () => {
		expect(extractPrice("No price here")).toBeNull();
	});

	it("extracts first price from text with multiple prices", () => {
		expect(extractPrice("De 500€ à 700€")).toBe(50000);
	});

	it("returns null for price without euro symbol", () => {
		expect(extractPrice("Price: 699 EUR")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractPrice("")).toBeNull();
	});

	it("handles zero price", () => {
		expect(extractPrice("Gratuit 0€")).toBe(0);
	});
});

// ── computeDiscount ─────────────────────────────────────────────

describe("computeDiscount", () => {
	it("returns positive discount when listing is below market", () => {
		expect(computeDiscount(60000, 100000)).toBe(40);
	});

	it("returns negative discount when listing is above market", () => {
		expect(computeDiscount(120000, 100000)).toBe(-20);
	});

	it("returns 0 when listing equals market median", () => {
		expect(computeDiscount(100000, 100000)).toBe(0);
	});

	it("returns null when median is null", () => {
		expect(computeDiscount(50000, null)).toBeNull();
	});

	it("returns null when median is 0", () => {
		expect(computeDiscount(50000, 0)).toBeNull();
	});

	it("returns null when median is negative", () => {
		expect(computeDiscount(50000, -100)).toBeNull();
	});

	it("rounds to nearest integer", () => {
		expect(computeDiscount(33300, 100000)).toBe(67);
	});

	it("returns 100 for free item", () => {
		expect(computeDiscount(0, 100000)).toBe(100);
	});
});

// ── parseSearxngComparables ─────────────────────────────────────

describe("parseSearxngComparables", () => {
	it("extracts comparables with prices from results", () => {
		const results = [
			{ title: "RTX 4090 Gaming OC", content: "À partir de 699€ sur BackMarket" },
			{ title: "RTX 4090 FE", content: "640€ - Très bon état" },
			{ title: "Guide d'achat GPU", content: "Les meilleures cartes graphiques" },
		];
		const comparables = parseSearxngComparables(results, "backmarket.fr");
		expect(comparables).toHaveLength(2);
		expect(comparables[0]).toEqual({ title: "RTX 4090 Gaming OC", price: 69900, source: "backmarket.fr" });
		expect(comparables[1]).toEqual({ title: "RTX 4090 FE", price: 64000, source: "backmarket.fr" });
	});

	it("falls back to title price when content has no price", () => {
		const results = [{ title: "iPhone 15 - 450€", content: "Reconditionné certifié" }];
		const comparables = parseSearxngComparables(results, "rakuten.com");
		expect(comparables).toHaveLength(1);
		expect(comparables[0]?.price).toBe(45000);
	});

	it("returns empty array when no prices found", () => {
		expect(parseSearxngComparables([{ title: "Article", content: "No price info" }], "searxng")).toEqual([]);
	});

	it("returns empty array for empty input", () => {
		expect(parseSearxngComparables([], "backmarket.fr")).toEqual([]);
	});

	it("handles European format prices in content", () => {
		const results = [{ title: "MacBook Pro M3", content: "À partir de 1.299,00€" }];
		const comparables = parseSearxngComparables(results, "backmarket.fr");
		expect(comparables[0]?.price).toBe(129900);
	});
});

// ── buildSiteQuery ──────────────────────────────────────────────

describe("buildSiteQuery", () => {
	it("adds site: operator to query", () => {
		expect(buildSiteQuery("RTX 4090", "backmarket.fr")).toBe("RTX 4090 site:backmarket.fr");
	});
});

// ── escapeLike ──────────────────────────────────────────────────

describe("escapeLike", () => {
	it("escapes % wildcard", () => {
		expect(escapeLike("100%")).toBe("100\\%");
	});

	it("escapes _ wildcard", () => {
		expect(escapeLike("test_value")).toBe("test\\_value");
	});

	it("escapes backslash", () => {
		expect(escapeLike("path\\file")).toBe("path\\\\file");
	});

	it("leaves normal text unchanged", () => {
		expect(escapeLike("RTX 4090")).toBe("RTX 4090");
	});
});

// ── fetchInternalHistory ────────────────────────────────────────

describe("fetchInternalHistory", () => {
	it("returns empty array when query has no meaningful keywords", async () => {
		const result = await fetchInternalHistory(null as never, "a b");
		expect(result).toEqual([]);
	});

	it("returns empty array for empty query", async () => {
		const result = await fetchInternalHistory(null as never, "");
		expect(result).toEqual([]);
	});

	it("returns empty array for whitespace-only query", async () => {
		const result = await fetchInternalHistory(null as never, "   ");
		expect(result).toEqual([]);
	});
});

// ── buildMarketContextString ───────────────────────────────────

describe("buildMarketContextString", () => {
	it("formats comparables grouped by source with median", () => {
		const comparables: Comparable[] = [
			{ title: "RTX 4090 OC", price: 69900, source: "backmarket.fr" },
			{ title: "RTX 4090 FE", price: 64000, source: "rakuten.com" },
			{ title: "RTX 4090 occasion", price: 58000, source: "bonplan-history", date: "2026-03-15T10:00:00Z" },
		];
		const result = buildMarketContextString("RTX 4090", comparables, 64000);

		expect(result).toContain('Comparables trouvés pour "RTX 4090"');
		expect(result).toContain("backmarket.fr");
		expect(result).toContain("rakuten.com");
		expect(result).toContain("bonplan-history");
		expect(result).toContain("699€");
		expect(result).toContain("640€");
		expect(result).toContain("580€");
		expect(result).toContain("Prix médian occasion estimé : 640€");
	});

	it("omits median line when median is null", () => {
		const result = buildMarketContextString("test", [{ title: "A", price: 10000, source: "searxng" }], null);
		expect(result).not.toContain("Prix médian");
	});

	it("limits to 3 items per source", () => {
		const comparables: Comparable[] = Array.from({ length: 5 }, (_, i) => ({
			title: `Item ${i}`,
			price: (i + 1) * 10000,
			source: "backmarket.fr",
		}));
		const result = buildMarketContextString("test", comparables, null);
		const lines = result.split("\n").filter((l) => l.startsWith("- backmarket.fr"));
		expect(lines).toHaveLength(3);
	});
});

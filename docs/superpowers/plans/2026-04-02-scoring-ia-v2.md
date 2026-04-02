# Scoring IA v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich AI scoring with structured market context from site-scoped SearXNG queries (BackMarket, Rakuten) and internal price history, producing comparables, market median, and discount percentage per analysis.

**Architecture:** Extend `fetchMarketContext()` to aggregate 4 data sources (2 site-scoped SearXNG, generic SearXNG, internal DB history) into a structured `MarketResearchResult`. The AI receives a richer prompt and returns curated comparables. `discount` and `marketMedian` are computed server-side in `analyze.ts`, not by the AI. Three new nullable columns on `analyses` allow backward-compatible rollout.

**Tech Stack:** Bun, TypeScript, Drizzle ORM, Zod, ioredis, SearXNG, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-02-smart-deals-v2-design.md` — Section 1

---

### Task 1: DB Schema — Add scoring v2 columns to `analyses`

**Files:**
- Modify: `packages/shared/src/db/schema.ts` (analyses table definition)
- Generate: new migration file via `drizzle-kit generate`

- [ ] **Step 1: Add 3 new columns to `analyses` table in schema.ts**

In `packages/shared/src/db/schema.ts`, add these columns to the `analyses` table definition, after the `providerUsed` column:

```typescript
		comparables: jsonb("comparables"),
		marketMedian: integer("market_median"),
		discount: integer("discount"),
```

These are all nullable by default (no `.notNull()`) — backward-compatible with existing rows.

- [ ] **Step 2: Generate the Drizzle migration**

Run:
```bash
bun run db:generate
```

Expected: A new migration file in `packages/shared/drizzle/` with `ALTER TABLE analyses ADD COLUMN comparables jsonb;` etc.

- [ ] **Step 3: Verify migration SQL**

Read the generated migration file and verify it contains exactly:
```sql
ALTER TABLE "analyses" ADD COLUMN "comparables" jsonb;
ALTER TABLE "analyses" ADD COLUMN "market_median" integer;
ALTER TABLE "analyses" ADD COLUMN "discount" integer;
```

- [ ] **Step 4: Apply migration**

Run:
```bash
bun run db:migrate
```

Expected: Migration applied successfully.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle/
git commit -m "feat(shared): add comparables, marketMedian, discount columns to analyses"
```

---

### Task 2: Market Research Types & Utility Functions

**Files:**
- Modify: `packages/analyzer/src/market-research.ts`
- Modify: `packages/analyzer/src/market-research.test.ts`

- [ ] **Step 1: Write failing tests for types and utilities**

Add to `packages/analyzer/src/market-research.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
	buildMarketQueries,
	buildSiteQuery,
	CACHE_TTL_SECONDS,
	computeMedian,
	extractPrice,
	parseSearxngComparables,
} from "./market-research";

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
		expect(computeMedian([10000, 10001])).toBe(10001); // Math.round(10000.5)
	});
});

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

	it("extracts price with space separator", () => {
		expect(extractPrice("À partir de 1 299€")).toBe(129900);
	});

	it("returns null when no price found", () => {
		expect(extractPrice("No price here")).toBeNull();
	});

	it("extracts first price from text with multiple prices", () => {
		expect(extractPrice("De 500€ à 700€")).toBe(50000);
	});
});

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
		const results = [{ title: "Article", content: "No price info" }];
		expect(parseSearxngComparables(results, "searxng")).toEqual([]);
	});
});

describe("buildSiteQuery", () => {
	it("adds site: operator to query", () => {
		expect(buildSiteQuery("RTX 4090", "backmarket.fr")).toBe("RTX 4090 site:backmarket.fr");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: FAIL — `computeMedian`, `extractPrice`, `parseSearxngComparables`, `buildSiteQuery` are not exported.

- [ ] **Step 3: Implement types and utilities**

Add to the top of `packages/analyzer/src/market-research.ts`, after the existing imports:

```typescript
// ── Types ────────────────────────────────────────────────────────

export type Comparable = {
	title: string;
	price: number; // cents
	source: string; // "backmarket.fr" | "rakuten.com" | "bonplan-history" | "searxng"
	date?: string; // ISO date
};

export type MarketResearchResult = {
	context: string; // Formatted text for AI prompt
	comparables: Comparable[]; // Structured data for storage
	median: number | null; // Median price in cents
};

// ── Utilities ────────────────────────────────────────────────────

/** Compute the median of an array of numbers. Returns null for empty arrays. */
export const computeMedian = (values: number[]): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 !== 0) return sorted[mid]!;
	return Math.round(((sorted[mid - 1]!) + (sorted[mid]!)) / 2);
};

/** Extract the first EUR price from a text string. Returns price in cents or null. */
export const extractPrice = (text: string): number | null => {
	const match = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*€/);
	if (!match?.[1]) return null;
	const cleaned = match[1].replace(/\s/g, "").replace(",", ".");
	const euros = Number.parseFloat(cleaned);
	return Number.isNaN(euros) ? null : Math.round(euros * 100);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Update CACHE_TTL_SECONDS test**

The spec requires changing cache TTL from 1h to 24h. Update the existing test in `market-research.test.ts`:

```typescript
it("exports cache TTL constant", () => {
	expect(CACHE_TTL_SECONDS).toBe(86400);
});
```

- [ ] **Step 6: Run test to see it fail**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: FAIL — `CACHE_TTL_SECONDS` is still 3600.

- [ ] **Step 7: Update cache TTL**

In `packages/analyzer/src/market-research.ts`, change:

```typescript
export const CACHE_TTL_SECONDS = 86400; // 24 hours
```

- [ ] **Step 8: Run tests to verify all pass**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/analyzer/src/market-research.ts packages/analyzer/src/market-research.test.ts
git commit -m "feat(analyzer): add market research types, utilities, and 24h cache TTL"
```

---

### Task 3: Internal Price History Query

**Files:**
- Modify: `packages/analyzer/src/market-research.ts`
- Modify: `packages/analyzer/src/market-research.test.ts`

- [ ] **Step 1: Write failing test for fetchInternalHistory**

Add to `packages/analyzer/src/market-research.test.ts`:

```typescript
import { fetchInternalHistory } from "./market-research";

describe("fetchInternalHistory", () => {
	it("returns empty array when query has no meaningful keywords", async () => {
		// No DB call needed — short-circuits on empty keywords
		const result = await fetchInternalHistory(null as never, "a b");
		expect(result).toEqual([]);
	});

	it("returns empty array for empty query", async () => {
		const result = await fetchInternalHistory(null as never, "");
		expect(result).toEqual([]);
	});
});
```

Note: Full integration tests with a real DB are out of scope here — we test the keyword-filtering guard clause. The SQL query itself is straightforward and will be validated by the typecheck + manual test.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: FAIL — `fetchInternalHistory` is not exported.

- [ ] **Step 3: Implement fetchInternalHistory**

Add to `packages/analyzer/src/market-research.ts`. First, update the imports at the top of the file:

```typescript
import { type createDb, createLogger, listings } from "@bonplan/shared";
import { and, desc, ilike, lt } from "drizzle-orm";
import type Redis from "ioredis";
```

(Replace the existing `createLogger`-only import and add Drizzle imports.)

Then add the `Db` type alias and the function after the existing utility functions, before `fetchMarketContext`:

```typescript
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

	// Build ILIKE pattern: "%keyword1%keyword2%"
	const pattern = `%${keywords.join("%")}%`;

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Run typecheck**

Run:
```bash
cd packages/analyzer && bun run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/analyzer/src/market-research.ts packages/analyzer/src/market-research.test.ts
git commit -m "feat(analyzer): add fetchInternalHistory for sold-listing comparables"
```

---

### Task 4: Restructure `fetchMarketContext()` to Return Structured Data

**Files:**
- Modify: `packages/analyzer/src/market-research.ts`
- Modify: `packages/analyzer/src/market-research.test.ts`

- [ ] **Step 1: Write test for the new return type**

Add to `packages/analyzer/src/market-research.test.ts`:

```typescript
import { buildMarketContextString } from "./market-research";
import type { Comparable } from "./market-research";

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: FAIL — `buildMarketContextString` is not exported.

- [ ] **Step 3: Add the context string builder**

Add to `packages/analyzer/src/market-research.ts`, before `fetchMarketContext`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify buildMarketContextString passes**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Rewrite `fetchMarketContext` to return `MarketResearchResult | null`**

Replace the entire `fetchMarketContext` function in `packages/analyzer/src/market-research.ts` with:

```typescript
export const fetchMarketContext = async (
	redis: Redis,
	db: Db,
	searchQuery: string,
	searxngUrl: string | undefined,
): Promise<MarketResearchResult | null> => {
	const cacheKey = `${CACHE_PREFIX}${searchQuery.toLowerCase().trim().replace(/\s+/g, " ")}`;

	// Check cache (now stores JSON)
	const cached = await redis.get(cacheKey);
	if (cached) {
		try {
			logger.info("Market research cache hit", { query: searchQuery });
			return JSON.parse(cached) as MarketResearchResult;
		} catch {
			// Cache corrupted — refetch
		}
	}

	try {
		const allComparables: Comparable[] = [];

		// 1. Site-scoped SearXNG queries (BackMarket, Rakuten)
		if (searxngUrl) {
			const sites = ["backmarket.fr", "rakuten.com"];
			const siteResults = await Promise.all(
				sites.map(async (site) => {
					try {
						const results = await fetchSearxng(searxngUrl, buildSiteQuery(searchQuery, site));
						return parseSearxngComparables(results, site);
					} catch {
						return [];
					}
				}),
			);
			allComparables.push(...siteResults.flat());
		}

		// 2. Generic SearXNG queries (existing behavior)
		if (searxngUrl) {
			const queries = buildMarketQueries(searchQuery);
			const allResults = await Promise.all(queries.map((q) => fetchSearxng(searxngUrl, q)));

			const seen = new Set<string>(allComparables.map((c) => c.title.toLowerCase().trim()));
			for (const results of allResults) {
				const comparables = parseSearxngComparables(results, "searxng");
				for (const c of comparables) {
					const key = c.title.toLowerCase().trim();
					if (!seen.has(key)) {
						seen.add(key);
						allComparables.push(c);
					}
				}
			}
		}

		// 3. Internal price history (sold listings)
		const internalComparables = await fetchInternalHistory(db, searchQuery);
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
```

- [ ] **Step 6: Remove old unused code**

Delete the old deduplication logic and context-building code that was in the previous `fetchMarketContext` implementation. The `fetchSearxng` private function stays unchanged.

- [ ] **Step 7: Run typecheck**

Run:
```bash
cd packages/analyzer && bun run typecheck
```

Expected: Errors in `analyze.ts` because `fetchMarketContext` signature changed (now requires `db` parameter and returns `MarketResearchResult | null` instead of `string | null`). These will be fixed in Task 8.

- [ ] **Step 8: Run market-research tests**

Run:
```bash
cd packages/analyzer && bun test src/market-research.test.ts
```

Expected: ALL PASS (the pure unit tests still work; existing tests for `buildMarketQueries` unchanged).

- [ ] **Step 9: Commit**

```bash
git add packages/analyzer/src/market-research.ts packages/analyzer/src/market-research.test.ts
git commit -m "feat(analyzer): restructure fetchMarketContext to return structured MarketResearchResult"
```

---

### Task 5: Update Scoring Schema — Add `comparables` to AI Response

**Files:**
- Modify: `packages/analyzer/src/scoring.ts`
- Modify: `packages/analyzer/src/scoring.test.ts`

- [ ] **Step 1: Write failing tests for the new schema**

Add to `packages/analyzer/src/scoring.test.ts`:

```typescript
describe("analysisResultSchema with comparables", () => {
	const baseValid = {
		matchesQuery: true,
		score: 75,
		verdict: "• Bon prix\n• Vendeur fiable",
		marketPriceLow: 500,
		marketPriceHigh: 700,
		redFlags: [],
		reasoning: "Test reasoning",
	};

	it("defaults comparables to empty array when omitted", () => {
		const result = analysisResultSchema.safeParse(baseValid);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.comparables).toEqual([]);
		}
	});

	it("accepts valid comparables array", () => {
		const result = analysisResultSchema.safeParse({
			...baseValid,
			comparables: [
				{ title: "RTX 4090 OC", price: 699, source: "backmarket.fr" },
				{ title: "RTX 4090 FE", price: 640, source: "rakuten.com", date: "2026-03-15" },
			],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.comparables).toHaveLength(2);
			expect(result.data.comparables[0]?.price).toBe(699);
		}
	});

	it("rounds comparable prices to integers", () => {
		const result = analysisResultSchema.safeParse({
			...baseValid,
			comparables: [{ title: "Test", price: 699.5, source: "searxng" }],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.comparables[0]?.price).toBe(700);
		}
	});

	it("rejects comparables with negative price", () => {
		const result = analysisResultSchema.safeParse({
			...baseValid,
			comparables: [{ title: "Test", price: -100, source: "searxng" }],
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/analyzer && bun test src/scoring.test.ts
```

Expected: FAIL — `comparables` is not in the schema.

- [ ] **Step 3: Add comparableSchema and extend analysisResultSchema**

In `packages/analyzer/src/scoring.ts`, add the comparable schema and extend the analysis result:

```typescript
import { z } from "zod";

export const comparableSchema = z.object({
	title: z.string(),
	price: z.number().min(0).transform(Math.round),
	source: z.string(),
	date: z.string().optional(),
});

export type AiComparable = z.infer<typeof comparableSchema>;

export const analysisResultSchema = z.object({
	reasoning: z.string().min(1),
	listingType: z.enum(["STANDALONE", "SYSTEM", "BUNDLE", "ACCESSORY", "IRRELEVANT"]).default("STANDALONE"),
	matchesQuery: z.boolean(),
	score: z.number().min(0).max(100).transform(Math.round),
	verdict: z.string().min(1),
	marketPriceLow: z.number().min(0).transform(Math.round).nullable(),
	marketPriceHigh: z.number().min(0).transform(Math.round).nullable(),
	redFlags: z.array(z.string()),
	comparables: z.array(comparableSchema).default([]),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

/** Swap marketPriceLow/High if the AI returned them in the wrong order */
export const normalizeMarketPrices = <T extends { marketPriceLow: number | null; marketPriceHigh: number | null }>(
	data: T,
): T => {
	if (data.marketPriceLow !== null && data.marketPriceHigh !== null && data.marketPriceLow > data.marketPriceHigh) {
		return { ...data, marketPriceLow: data.marketPriceHigh, marketPriceHigh: data.marketPriceLow };
	}
	return data;
};

export const batchItemSchema = analysisResultSchema.extend({
	id: z.number(),
});

export type BatchAnalysisResult = z.infer<typeof batchItemSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/analyzer && bun test src/scoring.test.ts
```

Expected: ALL PASS (existing tests still pass because `comparables` defaults to `[]`).

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/scoring.ts packages/analyzer/src/scoring.test.ts
git commit -m "feat(analyzer): add comparables field to analysis result schema"
```

---

### Task 6: Update AI Prompts — Structured Comparables & Bullet-Point Verdicts

**Files:**
- Modify: `packages/analyzer/src/prompts.ts`
- Modify: `packages/analyzer/src/prompts.test.ts`

- [ ] **Step 1: Write failing test for prompt changes**

Add to `packages/analyzer/src/prompts.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { buildAnalysisPrompt, buildBatchAnalysisPrompt } from "./prompts";

const baseListing = {
	title: "RTX 4090 Gaming OC",
	price: 65000,
	description: "Très bon état",
	sellerType: "particulier",
	location: "Paris",
	images: ["img1.jpg"],
};

describe("buildAnalysisPrompt", () => {
	it("includes comparables field in JSON example", () => {
		const { system } = buildAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			listing: baseListing,
			marketContext: null,
		});
		expect(system).toContain('"comparables"');
	});

	it("instructs bullet-point verdicts", () => {
		const { system } = buildAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			listing: baseListing,
			marketContext: null,
		});
		expect(system).toContain("bullet");
	});

	it("includes market context when provided", () => {
		const { user } = buildAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			listing: baseListing,
			marketContext: 'Comparables trouvés pour "RTX 4090" :\n- backmarket.fr: "RTX 4090 OC" → 699€',
		});
		expect(user).toContain("backmarket.fr");
		expect(user).toContain("699€");
	});
});

describe("buildBatchAnalysisPrompt", () => {
	it("includes comparables field in JSON example", () => {
		const { system } = buildBatchAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			items: [{ id: 1, listing: baseListing }],
			marketContext: null,
		});
		expect(system).toContain('"comparables"');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/analyzer && bun test src/prompts.test.ts
```

Expected: FAIL — system prompt doesn't contain `"comparables"` or `"bullet"`.

- [ ] **Step 3: Update SYSTEM_PROMPT in prompts.ts**

In `packages/analyzer/src/prompts.ts`, update the `SYSTEM_PROMPT`. Make these specific changes:

**a)** At line ~122 (JSON example section), replace the JSON fields block with:

```
Each result object must have these fields (put reasoning FIRST):
{
  "id": number (the listing number from the input),
  "reasoning": "Raisonnement étape par étape: 1) Classification, 2) Prix du marché, 3) Comparaison de prix",
  "listingType": "STANDALONE" | "SYSTEM" | "BUNDLE" | "ACCESSORY" | "IRRELEVANT",
  "matchesQuery": true/false,
  "score": 0-100,
  "verdict": "• Point clé 1\\n• Point clé 2\\n• Point clé 3",
  "marketPriceLow": number (EUR) or null,
  "marketPriceHigh": number (EUR) or null,
  "redFlags": [] or ["Annonce peu détaillée", "Pas de photos"],
  "comparables": [{"title": "Produit similaire", "price": 650, "source": "backmarket.fr"}]
}
```

**b)** Before the JSON example, add an instruction about verdict format:

```
**Verdict format:** Le verdict DOIT être en 2-3 bullet points (• ligne1\n• ligne2), PAS un paragraphe. Chaque point doit être concis (< 15 mots).

**Comparables:** Retourne les 3-5 prix comparables les plus pertinents parmi les données de recherche marché fournies. Chaque comparable a: title (string), price (number en EUR), source (string). Si aucune donnée marché n'est fournie, retourne un tableau vide [].
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/analyzer && bun test src/prompts.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/prompts.ts packages/analyzer/src/prompts.test.ts
git commit -m "feat(analyzer): update prompts for structured comparables and bullet-point verdicts"
```

---

### Task 7: Update `analyze.ts` — Wire Structured Market Data & Compute Discount

**Files:**
- Modify: `packages/analyzer/src/analyze.ts`

This is the integration task — no new tests (the existing flow is covered by the unit tests above, and integration testing requires a full Redis/DB/AI setup).

- [ ] **Step 1: Update imports in analyze.ts**

In `packages/analyzer/src/analyze.ts`, update the import from `market-research`:

```typescript
import { fetchMarketContext, type MarketResearchResult } from "./market-research";
```

- [ ] **Step 2: Update `saveAnalysis` signature and body**

Replace the `saveAnalysis` function with:

```typescript
const saveAnalysis = async (
	deps: AnalyzeDeps,
	listingId: string,
	searchId: string,
	userId: string,
	data: AnalysisResult,
	userModel: string,
	userProvider: string,
	marketMedian: number | null,
	listingPrice: number,
): Promise<void> => {
	const marketPriceLowCents = data.marketPriceLow !== null ? data.marketPriceLow * 100 : null;
	const marketPriceHighCents = data.marketPriceHigh !== null ? data.marketPriceHigh * 100 : null;

	// Convert AI comparables from EUR to cents for storage
	const comparablesCents = data.comparables.map((c) => ({
		...c,
		price: c.price * 100,
	}));

	// Compute discount: positive = below market, negative = above market
	const discount =
		marketMedian !== null && marketMedian > 0 ? Math.round((1 - listingPrice / marketMedian) * 100) : null;

	const values = {
		listingId,
		searchId,
		userId,
		matchesQuery: data.matchesQuery,
		listingType: data.listingType ?? null,
		score: data.score,
		verdict: data.verdict,
		marketPriceLow: marketPriceLowCents,
		marketPriceHigh: marketPriceHighCents,
		redFlags: data.redFlags,
		reasoning: data.reasoning,
		modelUsed: userModel,
		providerUsed: userProvider,
		comparables: comparablesCents,
		marketMedian,
		discount,
	};

	const [upserted] = await deps.db
		.insert(analyses)
		.values(values)
		.onConflictDoUpdate({
			target: [analyses.listingId, analyses.searchId],
			set: {
				matchesQuery: data.matchesQuery,
				listingType: data.listingType ?? null,
				score: data.score,
				verdict: data.verdict,
				marketPriceLow: marketPriceLowCents,
				marketPriceHigh: marketPriceHighCents,
				redFlags: data.redFlags,
				reasoning: data.reasoning,
				modelUsed: userModel,
				providerUsed: userProvider,
				comparables: comparablesCents,
				marketMedian,
				discount,
				updatedAt: new Date(),
			},
		})
		.returning({ id: analyses.id });

	if (upserted) {
		await publish(deps.redis, Stream.ListingAnalyzed, {
			searchId,
			userId,
			listingId,
			analysisId: upserted.id,
			score: data.score,
			verdict: data.verdict,
		});
	}
};
```

- [ ] **Step 3: Update `analyzeSingle` signature**

Change the `marketContext` parameter from `string | null` to `MarketResearchResult | null` and pass the new fields to `saveAnalysis`:

```typescript
const analyzeSingle = async (
	deps: AnalyzeDeps,
	listing: ListingRow,
	searchId: string,
	userId: string,
	searchQuery: string,
	aiContext: AiContext,
	providerType: ProviderType,
	apiKey: string,
	userModel: string,
	userProvider: string,
	marketResult: MarketResearchResult | null,
	allowBundles: boolean,
): Promise<void> => {
	const seller = extractSellerInfo(listing);
	const prompt = buildAnalysisPrompt({
		searchQuery,
		judgmentCriteria: aiContext.judgmentCriteria,
		listing: {
			title: listing.title,
			price: listing.price,
			description: listing.description,
			sellerType: listing.sellerType,
			...seller,
			location: listing.location,
			images: listing.images ?? [],
		},
		marketContext: marketResult?.context ?? null,
		allowBundles,
	});

	const { data } = await generateStructured({
		providerType,
		apiKey,
		model: userModel,
		schema: analysisResultSchema,
		system: prompt.system,
		prompt: prompt.user,
		maxOutputTokens: 2048,
	});

	const result = normalizeMarketPrices(data);
	await saveAnalysis(deps, listing.id, searchId, userId, result, userModel, userProvider, marketResult?.median ?? null, listing.price);
	logger.info("Listing analyzed (single)", { listingId: listing.id, score: result.score });
};
```

- [ ] **Step 4: Update `analyzeBatch` signature**

Same change — replace `marketContext: string | null` with `marketResult: MarketResearchResult | null`:

In the `analyzeBatch` function:
1. Change parameter `marketContext: string | null` → `marketResult: MarketResearchResult | null`
2. In the `buildBatchAnalysisPrompt` call, change `marketContext` → `marketContext: marketResult?.context ?? null`
3. In the `saveAnalysis` call (line ~330), add new args: `marketResult?.median ?? null, listing.price`
4. In the single-fallback calls inside `analyzeBatch`, pass `marketResult` instead of `marketContext`

- [ ] **Step 5: Update `saveFailedAnalysis`**

Add the three new columns with null values to `saveFailedAnalysis`:

```typescript
const saveFailedAnalysis = async (
	deps: AnalyzeDeps,
	listingId: string,
	searchId: string,
	userId: string,
	error: string,
	userModel: string,
	userProvider: string,
): Promise<void> => {
	await deps.db
		.insert(analyses)
		.values({
			listingId,
			searchId,
			userId,
			matchesQuery: false,
			score: null,
			verdict: "Analysis failed",
			marketPriceLow: null,
			marketPriceHigh: null,
			redFlags: [],
			reasoning: `Parse error: ${error}`,
			modelUsed: userModel,
			providerUsed: userProvider,
			comparables: null,
			marketMedian: null,
			discount: null,
		})
		.onConflictDoUpdate({
			target: [analyses.listingId, analyses.searchId],
			set: {
				matchesQuery: false,
				score: null,
				verdict: "Analysis failed",
				marketPriceLow: null,
				marketPriceHigh: null,
				redFlags: [],
				reasoning: `Parse error: ${error}`,
				modelUsed: userModel,
				providerUsed: userProvider,
				comparables: null,
				marketMedian: null,
				discount: null,
				updatedAt: new Date(),
			},
		});
};
```

- [ ] **Step 6: Update `startAnalysisConsumer` to pass `db` to `fetchMarketContext`**

In the consumer callback (around line 441), change:

```typescript
// Fetch market context once (cached 24h)
const marketResult = await fetchMarketContext(deps.redis, deps.db, searchQuery, deps.config.searxngUrl);
```

And update all calls to `analyzeSingle` and `analyzeBatch` in the consumer to pass `marketResult` instead of `marketContext`.

Specifically, replace every occurrence of `marketContext` in the consumer callback with `marketResult`. The calls look like:

```typescript
await analyzeSingle(
	deps,
	batch[0] as ListingRow,
	searchId,
	userId,
	searchQuery,
	aiContext,
	userProvider,
	apiKey,
	userModel,
	userProvider,
	marketResult,
	search.allowBundles,
);
```

and:

```typescript
await analyzeBatch(
	deps,
	batch,
	searchId,
	userId,
	searchQuery,
	aiContext,
	userProvider,
	apiKey,
	userModel,
	userProvider,
	marketResult,
	search.allowBundles,
);
```

- [ ] **Step 7: Run typecheck**

Run:
```bash
cd packages/analyzer && bun run typecheck
```

Expected: No errors. If there are errors, fix the type mismatches.

- [ ] **Step 8: Run all analyzer tests**

Run:
```bash
cd packages/analyzer && bun test
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/analyzer/src/analyze.ts
git commit -m "feat(analyzer): integrate structured market data, compute discount and median"
```

---

### Task 8: Update Gateway Schema — Add New Fields to API Response

**Files:**
- Modify: `packages/gateway/src/schemas/shared.ts`

- [ ] **Step 1: Add 3 new fields to `analysisResponseSchema`**

In `packages/gateway/src/schemas/shared.ts`, extend `analysisResponseSchema` with the new fields. Add after the `providerUsed` field:

```typescript
	comparables: z
		.array(
			z.object({
				title: z.string(),
				price: z.number().int(),
				source: z.string(),
				date: z.string().optional(),
			}),
		)
		.nullable(),
	marketMedian: z.number().int().nullable(),
	discount: z.number().int().nullable(),
```

- [ ] **Step 2: Run typecheck across the whole project**

Run:
```bash
bun run typecheck
```

Expected: No errors. The gateway handlers return `analyses.*` from DB which now includes the new columns, and the response schema accepts them.

- [ ] **Step 3: Run all tests**

Run:
```bash
bun test
```

Expected: ALL PASS

- [ ] **Step 4: Run lint/format**

Run:
```bash
bun run check:fix
```

Expected: Clean or auto-fixed.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/schemas/shared.ts
git commit -m "feat(gateway): add comparables, marketMedian, discount to analysis API response"
```

---

### Task 9: Final Verification & Cleanup

**Files:** None (verification only)

- [ ] **Step 1: Full typecheck**

Run:
```bash
bun run typecheck
```

Expected: No errors across all packages.

- [ ] **Step 2: Full test suite**

Run:
```bash
bun test
```

Expected: ALL PASS

- [ ] **Step 3: Lint and format**

Run:
```bash
bun run check
```

Expected: No errors.

- [ ] **Step 4: Verify DB migration is clean**

Run:
```bash
bun run db:generate
```

Expected: "No schema changes, nothing to migrate" (migration already generated in Task 1).

- [ ] **Step 5: Manual smoke test (if dev environment available)**

Start the dev environment and trigger a search:
```bash
bun run dev
```

Verify in DB that new analyses have:
- `comparables` populated with structured data
- `market_median` computed from market research
- `discount` computed from listing price vs median

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore(analyzer): scoring v2 cleanup"
```

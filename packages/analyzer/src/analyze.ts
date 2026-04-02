// packages/analyzer/src/analyze.ts
import { AiAuthError, AiQuotaError, AiRateLimitError, generateStructured } from "@bonplan/ai";
import type { AiContext, Config } from "@bonplan/shared";
import {
	analyses,
	buildKeyMap,
	createLogger,
	decrypt,
	listings,
	publish,
	Stream,
	searches,
	subscribe,
	users,
} from "@bonplan/shared";
import { getDefaultModel, type ProviderType } from "@bonplan/shared/ai-models";
import { and, eq, inArray } from "drizzle-orm";
import type Redis from "ioredis";
import { z } from "zod";
import { computeDiscount, fetchMarketContext, type MarketResearchResult } from "./market-research";
import { buildAnalysisPrompt, buildBatchAnalysisPrompt } from "./prompts";
import {
	type AnalysisResult,
	analysisResultSchema,
	type BatchAnalysisResult,
	batchItemSchema,
	normalizeMarketPrices,
} from "./scoring";

const logger = createLogger("analyzer");

const BATCH_SIZE = 5;

/** Extract seller info from the rawData stored by the scraper */
const extractSellerInfo = (listing: ListingRow) => {
	const raw = listing.rawData as Record<string, unknown> | null;
	if (!raw) return {};

	const owner = raw.owner as Record<string, unknown> | undefined;
	const attrs = Array.isArray(raw.attributes) ? (raw.attributes as Array<{ key: string; value: string }>) : undefined;

	const ratingAttr = attrs?.find((a) => a.key === "rating_score");
	const reviewCountAttr = attrs?.find((a) => a.key === "rating_count");

	const rating = ratingAttr ? Number.parseFloat(ratingAttr.value) : Number.NaN;
	const reviewCount = reviewCountAttr ? Number.parseInt(reviewCountAttr.value, 10) : Number.NaN;

	return {
		sellerName: typeof owner?.name === "string" ? owner.name : undefined,
		sellerRating: Number.isNaN(rating) ? null : rating,
		sellerReviewCount: Number.isNaN(reviewCount) ? null : reviewCount,
	};
};

type AnalyzeDeps = {
	db: ReturnType<typeof import("@bonplan/shared")["createDb"]>["db"];
	redis: Redis;
	config: Config;
};

type ListingRow = typeof listings.$inferSelect;

// ── Save a single analysis result to DB and publish event ─────────

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
	const comparablesCents = data.comparables.map((c) => ({ ...c, price: c.price * 100 }));

	const discount = computeDiscount(listingPrice, marketMedian);

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
			set: { ...values, updatedAt: new Date() },
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

// ── Single listing analysis (fallback) ───────────────────────────

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

// ── Batch analysis: multiple listings in one API call ────────────

const batchResultSchema = z.array(batchItemSchema);

const analyzeBatch = async (
	deps: AnalyzeDeps,
	listingRows: ListingRow[],
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
	// Build batch prompt with numbered items
	const items = listingRows.map((listing, i) => ({
		id: i + 1,
		listing: {
			title: listing.title,
			price: listing.price,
			description: listing.description,
			sellerType: listing.sellerType,
			...extractSellerInfo(listing),
			location: listing.location,
			images: listing.images ?? [],
		},
	}));

	const prompt = buildBatchAnalysisPrompt({
		searchQuery,
		judgmentCriteria: aiContext.judgmentCriteria,
		items,
		marketContext: marketResult?.context ?? null,
		allowBundles,
	});

	// Scale maxOutputTokens with batch size (~400 tokens per item)
	const maxOutputTokens = Math.min(8192, 1024 + items.length * 512);

	let batchResults: BatchAnalysisResult[];
	try {
		const { data } = await generateStructured({
			providerType,
			apiKey,
			model: userModel,
			schema: batchResultSchema,
			system: prompt.system,
			prompt: prompt.user,
			maxOutputTokens,
		});
		batchResults = data.map(normalizeMarketPrices);
	} catch (err) {
		// If it's an auth/quota/rate error, rethrow immediately
		if (err instanceof AiAuthError || err instanceof AiQuotaError || err instanceof AiRateLimitError) throw err;

		logger.warn("Batch structured generation failed, falling back to individual analysis", {
			searchId,
			count: items.length,
			error: err instanceof Error ? err.message : String(err),
		});
		// Fallback: analyze each listing individually
		for (const listing of listingRows) {
			try {
				await analyzeSingle(
					deps,
					listing,
					searchId,
					userId,
					searchQuery,
					aiContext,
					providerType,
					apiKey,
					userModel,
					userProvider,
					marketResult,
					allowBundles,
				);
			} catch (singleErr) {
				if (singleErr instanceof AiAuthError || singleErr instanceof AiQuotaError) throw singleErr;
				if (singleErr instanceof AiRateLimitError) {
					logger.warn("Rate limited in fallback", { listingId: listing.id });
					await saveFailedAnalysis(deps, listing.id, searchId, userId, "Rate limited", userModel, userProvider);
					continue;
				}
				logger.error("Single analysis fallback failed", { listingId: listing.id });
				await saveFailedAnalysis(
					deps,
					listing.id,
					searchId,
					userId,
					`Analysis failed: ${singleErr instanceof Error ? singleErr.message : String(singleErr)}`,
					userModel,
					userProvider,
				);
			}
		}
		return;
	}

	// Map batch results back to listings by id
	const resultMap = new Map(batchResults.map((r) => [r.id, r]));
	const missing: ListingRow[] = [];

	for (let i = 0; i < listingRows.length; i++) {
		const listing = listingRows[i] as ListingRow;
		const result = resultMap.get(i + 1);

		if (!result) {
			missing.push(listing);
			continue;
		}

		await saveAnalysis(deps, listing.id, searchId, userId, result, userModel, userProvider, marketResult?.median ?? null, listing.price);
		logger.info("Listing analyzed (batch)", { listingId: listing.id, score: result.score });
	}

	// Retry missing items individually
	if (missing.length > 0) {
		logger.info("Retrying missing batch items individually", { count: missing.length });
		for (const listing of missing) {
			try {
				await analyzeSingle(
					deps,
					listing,
					searchId,
					userId,
					searchQuery,
					aiContext,
					providerType,
					apiKey,
					userModel,
					userProvider,
					marketResult,
					allowBundles,
				);
			} catch (err) {
				if (err instanceof AiAuthError || err instanceof AiQuotaError) throw err;
				if (err instanceof AiRateLimitError) {
					await saveFailedAnalysis(deps, listing.id, searchId, userId, "Rate limited", userModel, userProvider);
					continue;
				}
				logger.error("Missing item retry failed", { listingId: listing.id });
				await saveFailedAnalysis(
					deps,
					listing.id,
					searchId,
					userId,
					`Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
					userModel,
					userProvider,
				);
			}
		}
	}
};

// ── Event consumer ─────────────────────────────────────────────────

export const startAnalysisConsumer = async (deps: AnalyzeDeps): Promise<{ stop: () => void }> => {
	const consumerId = `analyzer-${process.pid}`;
	const keyMap = buildKeyMap(deps.config);

	const sub = await subscribe(
		deps.redis,
		Stream.ListingsFound,
		"analyzer",
		consumerId,
		async (payload) => {
			const { searchId, userId, listingIds } = payload;

			// Get search to access aiContext
			const [search] = await deps.db.select().from(searches).where(eq(searches.id, searchId));

			if (!search?.aiContext) {
				logger.warn("Search not found or no AI context", { searchId });
				return;
			}

			const aiContext = search.aiContext as unknown as AiContext;
			const searchQuery = search.query;

			// Get user's API key and provider settings
			const [user] = await deps.db
				.select({
					aiApiKeyEncrypted: users.aiApiKeyEncrypted,
					aiApiKeyVersion: users.aiApiKeyVersion,
					aiProvider: users.aiProvider,
					aiModel: users.aiModel,
				})
				.from(users)
				.where(eq(users.id, userId));

			if (!user?.aiApiKeyEncrypted) {
				logger.security("invalid_api_key_detected", { userId, searchId, reason: "no_key_configured" });
				await publish(deps.redis, Stream.SearchError, {
					searchId,
					userId,
					source: "analyzer",
					error: "No API key configured",
					errorType: "invalid_api_key",
				});
				return;
			}

			let apiKey: string;
			try {
				apiKey = decrypt(user.aiApiKeyEncrypted, keyMap);
			} catch {
				logger.security("invalid_api_key_detected", { userId, searchId, reason: "decryption_failed" });
				await publish(deps.redis, Stream.SearchError, {
					searchId,
					userId,
					source: "analyzer",
					error: "Failed to decrypt API key",
					errorType: "invalid_api_key",
				});
				return;
			}

			const userProvider = (user.aiProvider ?? "claude") as ProviderType;
			const userModel = user.aiModel ?? getDefaultModel(userProvider);

			// Fetch market context once (cached 24h)
			const marketResult = await fetchMarketContext(deps.redis, deps.db, searchQuery, deps.config.searxngUrl);

			// Fetch all listings and filter those needing analysis
			const allListings =
				listingIds.length > 0 ? await deps.db.select().from(listings).where(inArray(listings.id, listingIds)) : [];

			// Check existing analyses for idempotency
			const existingAnalyses =
				allListings.length > 0
					? await deps.db
							.select({ listingId: analyses.listingId, updatedAt: analyses.updatedAt, score: analyses.score })
							.from(analyses)
							.where(
								and(
									inArray(
										analyses.listingId,
										allListings.map((l) => l.id),
									),
									eq(analyses.searchId, searchId),
								),
							)
					: [];

			const existingMap = new Map(
				existingAnalyses.map((a) => [a.listingId, { updatedAt: a.updatedAt, score: a.score }]),
			);

			const needsAnalysis = allListings.filter((listing) => {
				const existing = existingMap.get(listing.id);
				if (!existing) return true;
				if (existing.score === null) return true;
				if (existing.updatedAt > listing.createdAt) return false;
				return true;
			});

			if (needsAnalysis.length === 0) {
				logger.info("All listings already analyzed", { searchId, total: listingIds.length });
				return;
			}

			logger.info("Analyzing listings", {
				searchId,
				total: listingIds.length,
				needsAnalysis: needsAnalysis.length,
				batches: Math.ceil(needsAnalysis.length / BATCH_SIZE),
			});

			// Process in batches of BATCH_SIZE
			for (let i = 0; i < needsAnalysis.length; i += BATCH_SIZE) {
				const batch = needsAnalysis.slice(i, i + BATCH_SIZE);

				try {
					if (batch.length === 1) {
						// Single item — use single prompt (simpler, more reliable)
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
					} else {
						// Multiple items — batch prompt
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
					}
				} catch (err) {
					if (err instanceof AiAuthError || err instanceof AiQuotaError) {
						const errorType = err instanceof AiQuotaError ? "quota_exhausted" : "invalid_api_key";
						logger.security("invalid_api_key_detected", { userId, searchId, reason: "provider_auth_error" });
						await publish(deps.redis, Stream.SearchError, {
							searchId,
							userId,
							source: "analyzer",
							error: err.message,
							errorType,
						});
						return; // Stop — all remaining will fail
					}

					if (err instanceof AiRateLimitError) {
						logger.warn("Rate limited, saving failed for batch", { retryAfterMs: err.retryAfterMs });
						for (const listing of batch) {
							await saveFailedAnalysis(deps, listing.id, searchId, userId, "Rate limited", userModel, userProvider);
						}
						continue;
					}

					const error = err instanceof Error ? err : new Error(String(err));
					logger.error("Batch analysis failed", { searchId, batchStart: i, error: error.message });
				}
			}
		},
		{ logger, serviceName: "analyzer" },
	);

	return sub;
};

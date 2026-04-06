import { z } from "zod";

// ── AI Context (JSONB — typed to match AiContext from shared/types) ─
export const aiContextSchema = z
	.object({
		keywordVariations: z.array(z.string()),
		judgmentCriteria: z.string(),
		priceRange: z.object({ min: z.number(), max: z.number() }).nullable(),
		confidence: z.number(),
		searchUrls: z.array(z.string()),
	})
	.passthrough()
	.nullable();

// ── Search ──────────────────────────────────────────
export const searchResponseSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	query: z.string(),
	location: z.string(),
	postcode: z.string().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	radiusKm: z.number().int(),
	intervalMin: z.number().int(),
	status: z.enum(["pending", "mapping", "active", "paused", "blocked"]),
	aiContext: aiContextSchema,
	notifyWebhook: z.string().nullable(),
	minScore: z.number().int(),
	allowBundles: z.boolean(),
	analyzeImages: z.boolean(),
	lastScrapedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	blockedUntil: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Listing ─────────────────────────────────────────
export const listingResponseSchema = z.object({
	id: z.string().uuid(),
	searchId: z.string().uuid(),
	userId: z.string().uuid(),
	lbcId: z.string(),
	title: z.string(),
	price: z.number().int(),
	description: z.string(),
	images: z.array(z.string()),
	url: z.string(),
	sellerType: z.enum(["pro", "particulier"]),
	location: z.string(),
	rawData: z.any(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Analysis ────────────────────────────────────────
export const analysisResponseSchema = z.object({
	id: z.string().uuid(),
	listingId: z.string().uuid(),
	searchId: z.string().uuid(),
	userId: z.string().uuid(),
	matchesQuery: z.boolean(),
	listingType: z.string().nullable(),
	score: z.number().int().nullable(),
	verdict: z.string(),
	marketPriceLow: z.number().int().nullable(),
	marketPriceHigh: z.number().int().nullable(),
	redFlags: z.array(z.string()),
	reasoning: z.string(),
	modelUsed: z.string(),
	providerUsed: z.string().nullable(),
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
	imageAnalysis: z
		.object({
			findings: z.array(z.string()),
			condition: z.string(),
			scoreAdjustment: z.number(),
			originalScore: z.number(),
			modelUsed: z.string(),
		})
		.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Pagination ──────────────────────────────────────
export const paginationResponseSchema = z.object({
	hasMore: z.boolean(),
	nextCursor: z.string().nullable(),
});

// ── Pagination request ──────────────────────────────
export const paginationSchema = z.object({
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Validation error ────────────────────────────────
export const validationErrorSchema = z.object({
	error: z.union([z.string(), z.array(z.any())]),
});

// ── Password ────────────────────────────────────────
export const passwordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters")
	.regex(/[a-zA-Z]/, "Password must contain at least one letter")
	.regex(/[0-9]/, "Password must contain at least one number");

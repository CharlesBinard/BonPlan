import { z } from "zod";
import { analysisResponseSchema, listingResponseSchema, paginationSchema } from "../../schemas/shared";

export const createSearchSchema = z.object({
	query: z.string().min(1).max(500),
	location: z.string().max(200).default(""),
	radiusKm: z.number().int().min(1).max(500),
	intervalMin: z.number().int().min(5).max(1440).default(15),
	notifyWebhook: z
		.string()
		.url()
		.refine((url) => url.startsWith("https://"), "Webhook must use HTTPS")
		.optional()
		.nullable(),
	notifyDiscord: z.boolean().default(false),
	discordChannelId: z.string().optional().nullable(),
	minScore: z.number().int().min(0).max(100).default(70),
	allowBundles: z.boolean().default(false),
});

export const updateSearchSchema = z.object({
	intervalMin: z.number().int().min(5).max(1440).optional(),
	notifyWebhook: z
		.string()
		.url()
		.refine((url) => url.startsWith("https://"), "Webhook must use HTTPS")
		.optional()
		.nullable(),
	notifyDiscord: z.boolean().optional(),
	discordChannelId: z.string().optional().nullable(),
	minScore: z.number().int().min(0).max(100).optional(),
	status: z.enum(["active", "paused"]).optional(),
});

export const listingsQuerySchema = paginationSchema.extend({
	sort: z.enum(["score_desc", "score_asc", "price_asc", "price_desc", "date_desc", "date_asc"]).default("date_desc"),
	minScore: z.coerce.number().int().min(0).max(100).optional(),
});

// ── Listing with analysis (flattened as returned by handlers) ───
export const listingWithAnalysisSchema = listingResponseSchema.extend({
	analysis: analysisResponseSchema.nullable(),
});

// ── Search stats (inline in GET /:id) ───────────────
export const searchStatsSchema = z.object({
	listingCount: z.number().int(),
	goodDealCount: z.number().int(),
});

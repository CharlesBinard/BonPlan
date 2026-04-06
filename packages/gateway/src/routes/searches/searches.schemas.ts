import { z } from "zod";
import { analysisResponseSchema, listingResponseSchema, paginationSchema } from "../../schemas/shared";

export const createSearchSchema = z
	.object({
		query: z.string().min(1).max(500),
		location: z.string().max(200).default(""),
		postcode: z.string().max(10).optional().nullable(),
		latitude: z.number().min(-90).max(90).optional().nullable(),
		longitude: z.number().min(-180).max(180).optional().nullable(),
		radiusKm: z.number().int().min(1).max(500),
		intervalMin: z.number().int().min(5).max(1440).default(15),
		notifyWebhook: z
			.string()
			.url()
			.refine((url) => url.startsWith("https://"), "Webhook must use HTTPS")
			.optional()
			.nullable(),
		minScore: z.number().int().min(0).max(100).default(70),
		allowBundles: z.boolean().default(false),
		analyzeImages: z.boolean().default(false),
	})
	.refine((data) => (data.latitude == null) === (data.longitude == null), {
		message: "latitude and longitude must both be provided or both be null",
		path: ["latitude"],
	});

export const updateSearchSchema = z.object({
	intervalMin: z.number().int().min(5).max(1440).optional(),
	notifyWebhook: z
		.string()
		.url()
		.refine((url) => url.startsWith("https://"), "Webhook must use HTTPS")
		.optional()
		.nullable(),
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

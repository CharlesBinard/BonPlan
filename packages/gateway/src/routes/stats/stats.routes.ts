import { createRoute, z } from "@hono/zod-openapi";
import { analysisResponseSchema, listingResponseSchema } from "../../schemas/shared";

export const goodDealSchema = listingResponseSchema.extend({
	analysis: analysisResponseSchema,
	searchQuery: z.string(),
});

export const getStatsRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Stats"],
	responses: {
		200: {
			description: "Aggregate user stats",
			content: {
				"application/json": {
					schema: z.object({
						searchCount: z.number(),
						listingCount: z.number(),
						favoriteCount: z.number(),
						goodDealCount: z.number(),
					}),
				},
			},
		},
	},
});

export const getGoodDealsRoute = createRoute({
	method: "get",
	path: "/good-deals",
	tags: ["Stats"],
	responses: {
		200: {
			description: "Recent good deals",
			content: {
				"application/json": {
					schema: z.object({
						goodDeals: z.array(goodDealSchema),
					}),
				},
			},
		},
	},
});

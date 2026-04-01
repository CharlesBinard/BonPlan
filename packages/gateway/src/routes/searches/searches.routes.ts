import { createRoute, z } from "@hono/zod-openapi";
import {
	analysisResponseSchema,
	listingResponseSchema,
	paginationResponseSchema,
	searchResponseSchema,
	validationErrorSchema,
} from "../../schemas/shared";
import {
	createSearchSchema,
	listingsQuerySchema,
	listingWithAnalysisSchema,
	searchStatsSchema,
	updateSearchSchema,
} from "./searches.schemas";

export const listSearchesRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Searches"],
	responses: {
		200: {
			description: "List of user searches",
			content: { "application/json": { schema: z.object({ searches: z.array(searchResponseSchema) }) } },
		},
	},
});

export const createSearchRoute = createRoute({
	method: "post",
	path: "/",
	tags: ["Searches"],
	request: {
		body: {
			content: { "application/json": { schema: createSearchSchema } },
		},
	},
	responses: {
		201: {
			description: "Search created",
			content: { "application/json": { schema: z.object({ search: searchResponseSchema }) } },
		},
		400: {
			description: "Validation error",
			content: { "application/json": { schema: validationErrorSchema } },
		},
		403: {
			description: "API key required",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		500: {
			description: "Server error",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const getSearchRoute = createRoute({
	method: "get",
	path: "/{id}",
	tags: ["Searches"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
	},
	responses: {
		200: {
			description: "Search detail with stats",
			content: { "application/json": { schema: z.object({ search: searchResponseSchema, stats: searchStatsSchema }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const updateSearchRoute = createRoute({
	method: "patch",
	path: "/{id}",
	tags: ["Searches"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
		body: {
			content: { "application/json": { schema: updateSearchSchema } },
		},
	},
	responses: {
		200: {
			description: "Search updated",
			content: { "application/json": { schema: z.object({ search: searchResponseSchema }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		500: {
			description: "Server error",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const deleteSearchRoute = createRoute({
	method: "delete",
	path: "/{id}",
	tags: ["Searches"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
	},
	responses: {
		200: {
			description: "Search deleted",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const triggerSearchRoute = createRoute({
	method: "post",
	path: "/{id}/trigger",
	tags: ["Searches"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
	},
	responses: {
		200: {
			description: "Scrape triggered",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
		403: {
			description: "API key required",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		429: {
			description: "Rate limited",
			content: {
				"application/json": {
					schema: z.object({ error: z.string(), retryAfterSeconds: z.number() }),
				},
			},
		},
	},
});

export const listListingsRoute = createRoute({
	method: "get",
	path: "/{id}/listings",
	tags: ["Searches"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
		query: listingsQuerySchema,
	},
	responses: {
		200: {
			description: "Paginated listings",
			content: {
				"application/json": {
					schema: z.object({
						listings: z.array(listingWithAnalysisSchema),
						pagination: paginationResponseSchema,
					}),
				},
			},
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const getListingDetailRoute = createRoute({
	method: "get",
	path: "/{id}/listings/{listingId}",
	tags: ["Searches"],
	request: {
		params: z.object({
			id: z.string().uuid().openapi({ description: "Search ID" }),
			listingId: z.string().uuid().openapi({ description: "Listing ID" }),
		}),
	},
	responses: {
		200: {
			description: "Listing detail with analysis",
			content: {
				"application/json": {
					schema: z.object({ listing: listingResponseSchema, analysis: analysisResponseSchema.nullable() }),
				},
			},
		},
		404: {
			description: "Search or listing not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

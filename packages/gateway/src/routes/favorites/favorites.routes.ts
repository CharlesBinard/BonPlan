import { createRoute, z } from "@hono/zod-openapi";
import { listingResponseSchema } from "../../schemas/shared";

export const favoriteWithListingSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	listingId: z.string().uuid(),
	createdAt: z.string(),
	listing: listingResponseSchema,
});

export const listFavoritesRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Favorites"],
	responses: {
		200: {
			description: "List of favorites with listing details",
			content: { "application/json": { schema: z.object({ favorites: z.array(favoriteWithListingSchema) }) } },
		},
	},
});

export const addFavoriteRoute = createRoute({
	method: "post",
	path: "/{listingId}",
	tags: ["Favorites"],
	request: {
		params: z.object({ listingId: z.string().uuid().openapi({ description: "Listing ID" }) }),
	},
	responses: {
		201: {
			description: "Favorite added",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
	},
});

export const removeFavoriteRoute = createRoute({
	method: "delete",
	path: "/{listingId}",
	tags: ["Favorites"],
	request: {
		params: z.object({ listingId: z.string().uuid().openapi({ description: "Listing ID" }) }),
	},
	responses: {
		200: {
			description: "Favorite removed",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
		404: {
			description: "Favorite not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

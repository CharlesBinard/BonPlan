import { favorites, listings } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import type { AuthEnv } from "../../middleware/auth";
import { addFavoriteRoute, listFavoritesRoute, removeFavoriteRoute } from "./favorites.routes";

export const favoriteRoutes = new OpenAPIHono<AuthEnv>();

favoriteRoutes.openapi(listFavoritesRoute, async (c) => {
	const userId = c.get("userId");

	const rows = await db
		.select({ favorite: favorites, listing: listings })
		.from(favorites)
		.innerJoin(listings, eq(listings.id, favorites.listingId))
		.where(eq(favorites.userId, userId))
		.orderBy(sql`${favorites.createdAt} DESC`);

	return c.json({
		favorites: rows.map((r) => ({ ...r.favorite, listing: r.listing })),
	});
});

// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
favoriteRoutes.openapi(addFavoriteRoute, async (c) => {
	const userId = c.get("userId");
	const { listingId } = c.req.valid("param");

	const [listing] = await db
		.select({ id: listings.id })
		.from(listings)
		.where(and(eq(listings.id, listingId), eq(listings.userId, userId)));
	if (!listing) return c.json({ error: "Listing not found" }, 404);

	await db.insert(favorites).values({ userId, listingId }).onConflictDoNothing();

	return c.json({ success: true }, 201);
});

// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
favoriteRoutes.openapi(removeFavoriteRoute, async (c) => {
	const userId = c.get("userId");
	const { listingId } = c.req.valid("param");

	const deleted = await db
		.delete(favorites)
		.where(sql`${favorites.userId} = ${userId} AND ${favorites.listingId} = ${listingId}`)
		.returning({ id: favorites.id });

	if (deleted.length === 0) {
		return c.json({ error: "Favorite not found" }, 404);
	}

	return c.json({ success: true });
});

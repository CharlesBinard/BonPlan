import { analyses, favorites, listings, searches } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { count, eq, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import type { AuthEnv } from "../../middleware/auth";
import { getGoodDealsRoute, getStatsRoute } from "./stats.routes";

export const statsRoutes = new OpenAPIHono<AuthEnv>();

statsRoutes.openapi(getStatsRoute, async (c) => {
	const userId = c.get("userId");

	const [searchCountResult, listingCountResult, favoriteCountResult, goodDealCountResult] = await Promise.all([
		db.select({ count: count() }).from(searches).where(eq(searches.userId, userId)),
		db.select({ count: count() }).from(listings).where(eq(listings.userId, userId)),
		db.select({ count: count() }).from(favorites).where(eq(favorites.userId, userId)),
		db
			.select({ count: count() })
			.from(analyses)
			.innerJoin(searches, eq(searches.id, analyses.searchId))
			.where(sql`${analyses.userId} = ${userId} AND ${analyses.score} >= ${searches.minScore}`),
	]);

	return c.json({
		searchCount: Number(searchCountResult[0]?.count ?? 0),
		listingCount: Number(listingCountResult[0]?.count ?? 0),
		favoriteCount: Number(favoriteCountResult[0]?.count ?? 0),
		goodDealCount: Number(goodDealCountResult[0]?.count ?? 0),
	});
});

statsRoutes.openapi(getGoodDealsRoute, async (c) => {
	const userId = c.get("userId");

	const rows = await db
		.select({ listing: listings, analysis: analyses, searchQuery: searches.query })
		.from(analyses)
		.innerJoin(listings, eq(listings.id, analyses.listingId))
		.innerJoin(searches, eq(searches.id, analyses.searchId))
		.where(sql`${analyses.userId} = ${userId} AND ${analyses.score} >= ${searches.minScore}`)
		.orderBy(sql`${analyses.score} DESC, ${listings.createdAt} DESC`)
		.limit(12);

	return c.json({
		goodDeals: rows.map((r) => ({
			...r.listing,
			analysis: r.analysis,
			searchQuery: r.searchQuery,
		})),
	});
});

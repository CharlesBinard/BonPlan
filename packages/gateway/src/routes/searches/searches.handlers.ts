import { analyses, listings, publish, Stream, searches, users } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { count, eq, sql } from "drizzle-orm";
import { db, redis } from "../../lib/db";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { AuthEnv } from "../../middleware/auth";
import {
	createSearchRoute,
	deleteSearchRoute,
	getListingDetailRoute,
	getSearchRoute,
	listListingsRoute,
	listSearchesRoute,
	triggerSearchRoute,
	updateSearchRoute,
} from "./searches.routes";

export const searchRoutes = new OpenAPIHono<AuthEnv>();

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
searchRoutes.openapi(listSearchesRoute, async (c) => {
	const userId = c.get("userId");

	const rows = await db
		.select()
		.from(searches)
		.where(eq(searches.userId, userId))
		.orderBy(sql`${searches.createdAt} DESC`);

	return c.json({ searches: rows });
});

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
searchRoutes.openapi(createSearchRoute, async (c) => {
	const userId = c.get("userId");
	const body = c.req.valid("json");

	// API key gate
	const [user] = await db
		.select({
			aiApiKeyEncrypted: users.aiApiKeyEncrypted,
			aiProvider: users.aiProvider,
			aiModel: users.aiModel,
		})
		.from(users)
		.where(eq(users.id, userId));

	if (!user?.aiApiKeyEncrypted) {
		return c.json({ error: "AI API key required. Please configure your API key in settings." }, 403);
	}

	if (body.analyzeImages) {
		const { modelSupportsVision, getDefaultModel } = await import("@bonplan/shared/ai-models");
		const provider = (user.aiProvider ?? "claude") as import("@bonplan/shared/ai-models").ProviderType;
		const model = user.aiModel ?? getDefaultModel(provider);
		if (!modelSupportsVision(provider, model)) {
			return c.json({ error: "Le modèle AI sélectionné ne supporte pas l'analyse d'images." }, 400);
		}
	}

	const [search] = await db
		.insert(searches)
		.values({
			userId,
			query: body.query,
			location: body.location,
			postcode: body.postcode ?? null,
			latitude: body.latitude ?? null,
			longitude: body.longitude ?? null,
			radiusKm: body.radiusKm,
			intervalMin: body.intervalMin,
			notifyWebhook: body.notifyWebhook ?? null,
			notifyDiscord: body.notifyDiscord,
			discordChannelId: body.discordChannelId ?? null,
			minScore: body.minScore,
			allowBundles: body.allowBundles,
			analyzeImages: body.analyzeImages,
		})
		.returning();

	if (!search) {
		return c.json({ error: "Failed to create search" }, 500);
	}

	await publish(redis, Stream.SearchCreated, { searchId: search.id, userId });

	return c.json({ search }, 201);
});

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
searchRoutes.openapi(getSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");

	const [search] = await db
		.select()
		.from(searches)
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`);

	if (!search) {
		return c.json({ error: "Search not found" }, 404);
	}

	const [listingCountRow] = await db
		.select({ count: count() })
		.from(listings)
		.where(sql`${listings.searchId} = ${searchId} AND ${listings.userId} = ${userId}`);

	const [goodDealCountRow] = await db
		.select({ count: count() })
		.from(analyses)
		.where(
			sql`${analyses.searchId} = ${searchId} AND ${analyses.userId} = ${userId} AND ${analyses.score} >= ${search.minScore}`,
		);

	return c.json({
		search,
		stats: {
			listingCount: Number(listingCountRow?.count ?? 0),
			goodDealCount: Number(goodDealCountRow?.count ?? 0),
		},
	});
});

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
searchRoutes.openapi(updateSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");
	const body = c.req.valid("json");

	const existing = await db
		.select({ id: searches.id })
		.from(searches)
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`);

	if (existing.length === 0) {
		return c.json({ error: "Search not found" }, 404);
	}

	const changes = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);

	const [updated] = await db
		.update(searches)
		.set({ ...body, updatedAt: new Date() })
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`)
		.returning();

	if (!updated) {
		return c.json({ error: "Failed to update search" }, 500);
	}

	await publish(redis, Stream.SearchUpdated, { searchId, userId, changes });

	return c.json({ search: updated });
});

// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
searchRoutes.openapi(deleteSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");

	const deleted = await db
		.delete(searches)
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`)
		.returning({ id: searches.id });

	if (deleted.length === 0) {
		return c.json({ error: "Search not found" }, 404);
	}

	await publish(redis, Stream.SearchDeleted, { searchId });

	return c.json({ success: true });
});

// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
searchRoutes.openapi(triggerSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");

	// API key gate
	const [user] = await db
		.select({ aiApiKeyEncrypted: users.aiApiKeyEncrypted })
		.from(users)
		.where(eq(users.id, userId));

	if (!user?.aiApiKeyEncrypted) {
		return c.json({ error: "AI API key required. Please configure your API key in settings." }, 403);
	}

	// Verify search belongs to user (IDOR defense)
	const [search] = await db
		.select({ id: searches.id })
		.from(searches)
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`);

	if (!search) {
		return c.json({ error: "Search not found" }, 404);
	}

	// Rate limit: 1 trigger per 5 min per search
	const rateLimitKey = `trigger-limit:${searchId}`;
	const existing = await redis.get(rateLimitKey);

	if (existing) {
		const ttl = await redis.ttl(rateLimitKey);
		return c.json({ error: "Rate limited. Please wait before triggering again.", retryAfterSeconds: ttl }, 429);
	}

	await redis.set(rateLimitKey, "1", "EX", 300);

	await publish(redis, Stream.SearchTrigger, { searchId, userId });

	return c.json({ success: true });
});

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
searchRoutes.openapi(listListingsRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");
	const query = c.req.valid("query");

	// Verify search belongs to user
	const [search] = await db
		.select({ id: searches.id, minScore: searches.minScore })
		.from(searches)
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`);

	if (!search) {
		return c.json({ error: "Search not found" }, 404);
	}

	const cursorData = decodeCursor(query.cursor);
	const limit = query.limit;
	const sort = query.sort;
	const minScore = query.minScore;

	const needsAnalysis = minScore !== undefined || sort === "score_desc" || sort === "score_asc";

	const sortMap = {
		date_desc: sql`${listings.createdAt} DESC, ${listings.id} DESC`,
		date_asc: sql`${listings.createdAt} ASC, ${listings.id} ASC`,
		price_asc: sql`${listings.price} ASC, ${listings.id} ASC`,
		price_desc: sql`${listings.price} DESC, ${listings.id} DESC`,
		score_desc: sql`${analyses.score} DESC NULLS LAST, ${listings.id} DESC`,
		score_asc: sql`${analyses.score} ASC NULLS LAST, ${listings.id} ASC`,
	};

	const orderExpr = sortMap[sort];

	// Build cursor condition based on sort type
	const buildCursorCondition = () => {
		if (!cursorData) return null;
		const { value, id } = cursorData;

		switch (sort) {
			case "date_desc":
				return sql`(${listings.createdAt}, ${listings.id}) < (${value}::timestamptz, ${id}::uuid)`;
			case "date_asc":
				return sql`(${listings.createdAt}, ${listings.id}) > (${value}::timestamptz, ${id}::uuid)`;
			case "price_asc":
				return sql`(${listings.price}, ${listings.id}) > (${Number(value)}::int, ${id}::uuid)`;
			case "price_desc":
				return sql`(${listings.price}, ${listings.id}) < (${Number(value)}::int, ${id}::uuid)`;
			case "score_desc":
				return sql`(${analyses.score}, ${listings.id}) < (${Number(value)}::int, ${id}::uuid)`;
			case "score_asc":
				return sql`(${analyses.score}, ${listings.id}) > (${Number(value)}::int, ${id}::uuid)`;
		}
	};

	const cursorCondition = buildCursorCondition();

	// Base conditions always present
	const baseCondition = sql`${listings.searchId} = ${searchId} AND ${listings.userId} = ${userId}`;

	let rows: Array<{
		listing: typeof listings.$inferSelect;
		analysis: typeof analyses.$inferSelect | null;
	}>;

	if (needsAnalysis) {
		const conditions = [baseCondition];
		if (minScore !== undefined) {
			conditions.push(sql`(${analyses.score} IS NULL OR ${analyses.score} >= ${minScore})`);
		}
		if (cursorCondition) {
			conditions.push(cursorCondition);
		}
		// biome-ignore lint/style/noNonNullAssertion: conditions always has at least one element
		const whereClause = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)!;

		rows = await db
			.select({ listing: listings, analysis: analyses })
			.from(listings)
			.leftJoin(analyses, eq(analyses.listingId, listings.id))
			.where(whereClause)
			.orderBy(orderExpr)
			.limit(limit + 1);
	} else {
		const conditions = [baseCondition];
		if (cursorCondition) {
			conditions.push(cursorCondition);
		}
		// biome-ignore lint/style/noNonNullAssertion: conditions always has at least one element
		const whereClause = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)!;

		rows = (await db
			.select({ listing: listings, analysis: sql<null>`NULL`.as("analysis") })
			.from(listings)
			.where(whereClause)
			.orderBy(orderExpr)
			.limit(limit + 1)) as Array<{
			listing: typeof listings.$inferSelect;
			analysis: typeof analyses.$inferSelect | null;
		}>;
	}

	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	// Encode next cursor based on sort field
	let nextCursor: string | null = null;
	if (hasMore && rows.length > 0) {
		const last = rows[rows.length - 1];
		if (last) {
			switch (sort) {
				case "date_desc":
				case "date_asc":
					nextCursor = encodeCursor(last.listing.createdAt.toISOString(), last.listing.id);
					break;
				case "price_asc":
				case "price_desc":
					nextCursor = encodeCursor(String(last.listing.price), last.listing.id);
					break;
				case "score_desc":
				case "score_asc":
					nextCursor = encodeCursor(String(last.analysis?.score ?? 0), last.listing.id);
					break;
			}
		}
	}

	return c.json({
		listings: rows.map((r) => ({ ...r.listing, analysis: r.analysis })),
		pagination: {
			hasMore,
			nextCursor,
		},
	});
});

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
searchRoutes.openapi(getListingDetailRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId, listingId } = c.req.valid("param");

	// Verify search belongs to user (IDOR defense)
	const [search] = await db
		.select({ id: searches.id })
		.from(searches)
		.where(sql`${searches.id} = ${searchId} AND ${searches.userId} = ${userId}`);

	if (!search) {
		return c.json({ error: "Search not found" }, 404);
	}

	const [listing] = await db
		.select()
		.from(listings)
		.where(
			sql`${listings.id} = ${listingId} AND ${listings.searchId} = ${searchId} AND ${listings.userId} = ${userId}`,
		);

	if (!listing) {
		return c.json({ error: "Listing not found" }, 404);
	}

	const [analysis] = await db
		.select()
		.from(analyses)
		.where(
			sql`${analyses.listingId} = ${listingId} AND ${analyses.searchId} = ${searchId} AND ${analyses.userId} = ${userId}`,
		);

	return c.json({ listing, analysis: analysis ?? null });
});

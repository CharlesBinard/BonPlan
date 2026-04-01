import { publish, Stream, searches } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { db, redis } from "../../lib/db";
import {
	deleteDiscordSearchRoute,
	listDiscordSearchesRoute,
	triggerDiscordSearchRoute,
	updateDiscordSearchRoute,
} from "./discord.routes";

type DiscordEnv = { Variables: { userId: string } };
export const discordApiRoutes = new OpenAPIHono<DiscordEnv>();

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
discordApiRoutes.openapi(listDiscordSearchesRoute, async (c) => {
	const userId = c.get("userId");
	const results = await db.select().from(searches).where(eq(searches.userId, userId)).orderBy(desc(searches.createdAt));
	return c.json({ data: results });
});

// @ts-expect-error: DB returns Date objects and JSONB as unknown; JSON serialisation resolves the mismatch
discordApiRoutes.openapi(updateDiscordSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");
	const body = c.req.valid("json");

	if (body.status) {
		const [updated] = await db
			.update(searches)
			.set({ status: body.status, updatedAt: new Date() })
			.where(and(eq(searches.id, searchId), eq(searches.userId, userId)))
			.returning();
		if (!updated) return c.json({ error: "not_found" }, 404);

		await publish(redis, Stream.SearchUpdated, { searchId, userId, changes: ["status"] });
		return c.json({ data: updated });
	}
	return c.json({ error: "invalid_status" }, 400);
});

// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
discordApiRoutes.openapi(deleteDiscordSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");

	const [deleted] = await db
		.delete(searches)
		.where(and(eq(searches.id, searchId), eq(searches.userId, userId)))
		.returning({ id: searches.id });
	if (!deleted) return c.json({ error: "not_found" }, 404);

	await publish(redis, Stream.SearchDeleted, { searchId });
	return c.json({ data: { id: deleted.id } });
});

// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
discordApiRoutes.openapi(triggerDiscordSearchRoute, async (c) => {
	const userId = c.get("userId");
	const { id: searchId } = c.req.valid("param");

	const [search] = await db
		.select()
		.from(searches)
		.where(and(eq(searches.id, searchId), eq(searches.userId, userId)));
	if (!search) return c.json({ error: "not_found" }, 404);

	// Rate limit: 1 trigger per 5 min per search (mirrors searches.ts trigger route)
	const rateLimitKey = `trigger-limit:${searchId}`;
	const existing = await redis.get(rateLimitKey);

	if (existing) {
		const ttl = await redis.ttl(rateLimitKey);
		return c.json({ error: "Rate limited. Please wait before triggering again.", retryAfterSeconds: ttl }, 429);
	}

	await redis.set(rateLimitKey, "1", "EX", 300);

	await publish(redis, Stream.SearchTrigger, { searchId, userId });
	return c.json({ data: { triggered: true } });
});

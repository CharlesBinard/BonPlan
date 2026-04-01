import { notifications } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { AuthEnv } from "../../middleware/auth";
import { listNotificationsRoute } from "./notifications.routes";

export const notificationRoutes = new OpenAPIHono<AuthEnv>();

notificationRoutes.openapi(listNotificationsRoute, async (c) => {
	const userId = c.get("userId");
	const query = c.req.valid("query");

	const cursorData = decodeCursor(query.cursor);
	const limit = query.limit;

	const conditions: ReturnType<typeof sql>[] = [eq(notifications.userId, userId)];

	if (query.status) {
		conditions.push(eq(notifications.status, query.status));
	}

	if (query.channel) {
		conditions.push(eq(notifications.channel, query.channel));
	}

	if (cursorData) {
		conditions.push(
			sql`(${notifications.createdAt}, ${notifications.id}) < (${cursorData.value}::timestamptz, ${cursorData.id}::uuid)`,
		);
	}

	// biome-ignore lint/style/noNonNullAssertion: conditions always has at least one element
	const whereClause = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)!;

	const rows = await db
		.select()
		.from(notifications)
		.where(whereClause)
		.orderBy(sql`${notifications.createdAt} DESC, ${notifications.id} DESC`)
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	let nextCursor: string | null = null;
	if (hasMore && rows.length > 0) {
		const last = rows[rows.length - 1];
		if (last) {
			nextCursor = encodeCursor(last.createdAt.toISOString(), last.id);
		}
	}

	return c.json({
		notifications: rows,
		pagination: {
			hasMore,
			nextCursor,
		},
	});
});

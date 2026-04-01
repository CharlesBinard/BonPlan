import { deadLetterStream } from "@bonplan/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { db, redis } from "../../lib/db";

export const healthRoutes = new OpenAPIHono();

const healthCheckRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Health"],
	responses: {
		200: {
			description: "All services healthy",
			content: {
				"application/json": {
					schema: z.object({
						status: z.enum(["ok", "degraded"]),
						checks: z.record(z.string(), z.string()),
						deadLetterDepth: z.record(z.string(), z.number()),
					}),
				},
			},
		},
		503: {
			description: "One or more services unhealthy",
			content: {
				"application/json": {
					schema: z.object({
						status: z.enum(["ok", "degraded"]),
						checks: z.record(z.string(), z.string()),
						deadLetterDepth: z.record(z.string(), z.number()),
					}),
				},
			},
		},
	},
});

healthRoutes.openapi(healthCheckRoute, async (c) => {
	const checks: Record<string, string> = {};

	try {
		await db.execute(sql`SELECT 1`);
		checks.postgres = "ok";
	} catch {
		checks.postgres = "error";
	}

	try {
		await redis.ping();
		checks.redis = "ok";
	} catch {
		checks.redis = "error";
	}

	const dlQueues: Record<string, number> = {};
	for (const service of ["orchestrator", "scraper", "analyzer", "notifier", "gateway-ws"]) {
		try {
			const len = await redis.xlen(deadLetterStream(service));
			dlQueues[service] = len;
		} catch {
			dlQueues[service] = -1;
		}
	}

	const allHealthy = checks.postgres === "ok" && checks.redis === "ok";
	return c.json(
		{ status: allHealthy ? ("ok" as const) : ("degraded" as const), checks, deadLetterDepth: dlQueues },
		allHealthy ? 200 : 503,
	);
});

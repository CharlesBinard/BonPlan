import { createLogger, deadLetterStream } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { config, redis } from "../../lib/db";
import { listDeadLettersRoute } from "./admin.routes";

const logger = createLogger("gateway");

type AuthEnv = { Variables: { userId: string } };
export const adminRoutes = new OpenAPIHono<AuthEnv>();

adminRoutes.openapi(
	listDeadLettersRoute,
	// @ts-expect-error: multi-status handlers produce union types that can't satisfy strict route typing
	async (c) => {
		const userId = c.get("userId");

		if (!config.adminUserId || userId !== config.adminUserId) {
			logger.security("admin_endpoint_forbidden", {
				userId,
				ip: c.req.header("x-forwarded-for") ?? "unknown",
				endpoint: "/api/admin/dead-letters",
			});
			return c.json({ error: "Forbidden" }, 403);
		}

		logger.security("admin_endpoint_access", {
			userId,
			ip: c.req.header("x-forwarded-for") ?? "unknown",
			endpoint: "/api/admin/dead-letters",
		});

		const result: Record<string, unknown[]> = {};
		for (const service of ["orchestrator", "scraper", "analyzer", "notifier", "gateway-ws"]) {
			const messages = await redis.xrange(deadLetterStream(service), "-", "+", "COUNT", "50");
			result[service] = messages.map(([id, fields]) => {
				const data: Record<string, string> = { id };
				for (let i = 0; i < fields.length; i += 2) {
					const key = fields[i] ?? "";
					data[key] = fields[i + 1] ?? "";
				}
				return data;
			});
		}

		return c.json({ data: result });
	},
);

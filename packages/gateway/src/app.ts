import { createLogger } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { auth } from "./lib/auth";
import { requireAuth } from "./middleware/auth";
import { discordServiceAuth } from "./middleware/discord-service";
import { handleError } from "./middleware/error-handler";
import { ipRateLimit, userRateLimit } from "./middleware/rate-limit";
import { securityHeaders } from "./middleware/security-headers";
import { adminRoutes } from "./routes/admin/admin.handlers";
import { discordApiRoutes } from "./routes/discord/discord.handlers";
import { favoriteRoutes } from "./routes/favorites/favorites.handlers";
import { healthRoutes } from "./routes/health/health.routes";
import { notificationRoutes } from "./routes/notifications/notifications.handlers";
import { searchRoutes } from "./routes/searches/searches.handlers";
import { settingsRoutes } from "./routes/settings/settings.handlers";
import { statsRoutes } from "./routes/stats/stats.handlers";
import { geocodeRoutes } from "./routes/geocode/geocode.handlers";

const logger = createLogger("gateway");

export const app = new OpenAPIHono({
	defaultHook: (result, c) => {
		if (!result.success) {
			return c.json({ error: "validation_error", details: result.error.flatten() }, 422);
		}
	},
});

// ── Global middleware
app.use("*", securityHeaders);
app.onError(handleError);

// ── Public routes (no auth)
app.route("/health", healthRoutes);
app.post("/csp-report", async (c) => {
	const body = await c.req.json();
	logger.security("csp_violation", { report: body });
	return c.json({ received: true });
});

// ── Auth routes (rate limited by IP, no session required)
app.use("/api/auth/*", ipRateLimit(10, 60_000));
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
	// auth.handler returns a raw Response that bypasses Hono's post-next()
	// middleware, so we apply security headers manually here.
	const response = await auth.handler(c.req.raw);
	const mutable = new Response(response.body, response);
	mutable.headers.set("X-Content-Type-Options", "nosniff");
	mutable.headers.set("X-Frame-Options", "DENY");
	mutable.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	return mutable;
});

// Discord bot API routes (service token auth, before requireAuth)
app.use("/api/discord/*", discordServiceAuth);
app.route("/api/discord", discordApiRoutes);

// ── Authenticated routes
app.use("/api/*", requireAuth);
app.use("/api/*", userRateLimit(100, 60_000));

app.route("/api/geocode", geocodeRoutes);
app.route("/api/searches", searchRoutes);
app.route("/api/favorites", favoriteRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/admin", adminRoutes);

// ── OpenAPI spec & docs (disabled in production)
if (process.env.NODE_ENV !== "production") {
	app.doc("/openapi.json", {
		openapi: "3.1.0",
		info: {
			title: "BonPlan API",
			version: "1.0.0",
			description: "Deal-finding API for LeBonCoin",
		},
	});

	app.get("/docs", apiReference({ url: "/openapi.json" }));
}

import { resolve } from "node:path";
import { createLogger, runMigrations } from "@bonplan/shared";
import { serveStatic } from "hono/bun";
import { app } from "./app";
import { db, pgClient, redis } from "./lib/db";
import { cleanupWebSocket, setupWebSocket } from "./lib/ws";

const logger = createLogger("gateway");

// ── Run database migrations
await runMigrations(db, resolve(process.cwd(), "packages/shared/drizzle"));
logger.info("Database migrations applied");

// ── WebSocket
const websocket = await setupWebSocket(app);

// ── Static frontend (must be after all API routes)
const frontendDist = resolve(import.meta.dir, "../../frontend/dist");

// Serve frontend static files
app.use("/*", serveStatic({ root: frontendDist }));
// SPA fallback — serve index.html for client-side routes
app.get("/*", serveStatic({ path: resolve(frontendDist, "index.html") }));

// ── Start server
const port = Number(process.env.PORT ?? 3000);

// Use Bun.serve() explicitly for proper --watch hot-reload support.
// The declarative `export default` pattern causes EADDRINUSE on reload
// because it tries to create a new server before closing the old one.
const server = Bun.serve({
	port,
	fetch: app.fetch,
	websocket,
});

logger.info("Gateway started", { port: server.port });

// ── Graceful shutdown
const shutdown = async () => {
	logger.info("Shutting down gateway...");
	await cleanupWebSocket();
	server.stop();
	await pgClient.end();
	redis.disconnect();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

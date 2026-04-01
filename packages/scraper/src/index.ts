// packages/scraper/src/index.ts
import { createDb, createLogger, createRedis, loadConfig } from "@bonplan/shared";
import { closeConnection } from "./browser/browser";
import { startScrapeConsumer } from "./scrape";

const config = loadConfig();
const logger = createLogger("scraper");

const { db } = createDb(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const main = async (): Promise<void> => {
	const consumer = await startScrapeConsumer({ db, redis, config });

	logger.info("Scraper running", {
		browserWsUrl: config.browserWsUrl ?? "ws://localhost:9222",
		proxyNote: "Proxy configured at browser container level, not scraper",
	});

	let shuttingDown = false;
	const shutdown = async (): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info("Scraper shutting down");
		await Promise.race([
			(async () => {
				await consumer.stop();
				await closeConnection().catch(() => {});
				await redis.quit();
			})(),
			new Promise((resolve) => setTimeout(resolve, 10_000)),
		]);
		process.exit(0);
	};

	process.on("SIGINT", () => {
		shutdown().catch(console.error);
	});
	process.on("SIGTERM", () => {
		shutdown().catch(console.error);
	});
};

main().catch((err) => {
	logger.error("Scraper failed to start", { error: String(err) });
	process.exit(1);
});

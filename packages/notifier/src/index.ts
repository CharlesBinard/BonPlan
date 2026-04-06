// packages/notifier/src/index.ts
import { createDb, createLogger, createRedis, loadConfig } from "@bonplan/shared";
import { startNotificationConsumer } from "./notify";

const config = loadConfig();
const logger = createLogger("notifier");

const { db, client: pgClient } = createDb(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const main = async (): Promise<void> => {
	const consumer = await startNotificationConsumer({
		db,
		redis,
		config,
	});

	logger.info("Notifier running");

	let shuttingDown = false;
	const shutdown = async (): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info("Notifier shutting down");
		await consumer.stop();
		redis.disconnect();
		await pgClient.end();
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown().catch(console.error));
	process.on("SIGTERM", () => shutdown().catch(console.error));
};

main().catch((err) => {
	logger.error("Notifier failed to start", { error: String(err) });
	process.exit(1);
});

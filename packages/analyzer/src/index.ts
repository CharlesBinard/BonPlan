// packages/analyzer/src/index.ts
import { createDb, createLogger, createRedis, loadConfig } from "@bonplan/shared";
import { startAnalysisConsumer } from "./analyze";

const config = loadConfig();
const logger = createLogger("analyzer");

if (!config.encryptionKey) {
	throw new Error("ENCRYPTION_KEY is required for the analyzer");
}

const { db, client: pgClient } = createDb(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const main = async (): Promise<void> => {
	const consumer = await startAnalysisConsumer({ db, redis, config });

	logger.info("Analyzer running", { searxngUrl: config.searxngUrl ?? "disabled" });

	const shutdown = async (): Promise<void> => {
		logger.info("Analyzer shutting down");
		await consumer.stop();
		redis.disconnect();
		await pgClient.end();
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown().catch(console.error));
	process.on("SIGTERM", () => shutdown().catch(console.error));
};

main().catch((err) => {
	logger.error("Analyzer failed to start", { error: String(err) });
	process.exit(1);
});

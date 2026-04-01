// packages/notifier/src/index.ts
import { createDb, createLogger, createRedis, loadConfig } from "@bonplan/shared";
import { createDiscordBot } from "./discord/bot";
import { startNotificationConsumer } from "./notify";

const config = loadConfig();
const logger = createLogger("notifier");

const { db, client: pgClient } = createDb(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const main = async (): Promise<void> => {
	let discordBot: Awaited<ReturnType<typeof createDiscordBot>> | null = null;

	if (config.discordBotToken && config.discordServiceToken) {
		discordBot = await createDiscordBot(
			{
				token: config.discordBotToken,
				serviceToken: config.discordServiceToken,
				gatewayUrl: config.gatewayUrl ?? "http://localhost:3000",
			},
			redis,
		);
		logger.info("Discord bot initialized");
	} else {
		logger.info("Discord bot disabled (no DISCORD_BOT_TOKEN)");
	}

	const consumer = await startNotificationConsumer({
		db,
		redis,
		config,
		discord: discordBot?.sender ?? null,
	});

	logger.info("Notifier running", { discordEnabled: !!discordBot });

	let shuttingDown = false;
	const shutdown = async (): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info("Notifier shutting down");
		await consumer.stop();
		discordBot?.destroy().catch((err) => logger.error("Discord destroy failed", { error: String(err) }));
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

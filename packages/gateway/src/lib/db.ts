import { createDb, createRedis, type DbInstance, loadConfig } from "@bonplan/shared";

const config = loadConfig();

if (!config.betterAuthSecret) {
	throw new Error("BETTER_AUTH_SECRET is required for the gateway");
}
if (!config.encryptionKey) {
	throw new Error("ENCRYPTION_KEY is required for the gateway");
}

const _dbInstance: DbInstance = createDb(config.databaseUrl);
export const db: DbInstance["db"] = _dbInstance.db;
export const pgClient: DbInstance["client"] = _dbInstance.client;
export const redis = createRedis(config.redisUrl);
export { config };

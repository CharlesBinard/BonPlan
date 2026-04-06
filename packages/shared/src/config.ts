import { z } from "zod";

const optionalString = z.string().min(1).optional();

const configSchema = z.object({
	databaseUrl: z.string().min(1),
	redisUrl: z.string().min(1),
	encryptionKey: optionalString,
	encryptionKeyV2: optionalString,
	betterAuthSecret: optionalString,
	browserWsUrl: optionalString,
	searxngUrl: optionalString,
	proxyUrl: optionalString,
	gatewayUrl: optionalString,
	nodeEnv: z.enum(["development", "production", "test"]).default("development"),
	adminUserId: optionalString,
});

type Config = z.infer<typeof configSchema>;

export const loadConfig = (): Config => {
	return configSchema.parse({
		databaseUrl: process.env.DATABASE_URL,
		redisUrl: process.env.REDIS_URL,
		encryptionKey: process.env.ENCRYPTION_KEY || undefined,
		encryptionKeyV2: process.env.ENCRYPTION_KEY_V2 || undefined,
		betterAuthSecret: process.env.BETTER_AUTH_SECRET || undefined,
		browserWsUrl: process.env.BROWSER_WS_URL || undefined,
		searxngUrl: process.env.SEARXNG_URL || undefined,
		proxyUrl: process.env.PROXY_URL || undefined,
		gatewayUrl: process.env.GATEWAY_URL || undefined,
		nodeEnv: process.env.NODE_ENV || undefined,
		adminUserId: process.env.ADMIN_USER_ID || undefined,
	});
};

export const buildKeyMap = (config: Config): Record<number, string> => {
	const keyMap: Record<number, string> = {};
	if (config.encryptionKey) keyMap[1] = config.encryptionKey;
	if (config.encryptionKeyV2) keyMap[2] = config.encryptionKeyV2;
	return keyMap;
};

export type { Config };

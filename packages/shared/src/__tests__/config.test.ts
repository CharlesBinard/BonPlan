import { beforeEach, describe, expect, it } from "bun:test";
import { loadConfig } from "../config";

describe("loadConfig", () => {
	beforeEach(() => {
		delete process.env.DATABASE_URL;
		delete process.env.REDIS_URL;
		delete process.env.ENCRYPTION_KEY;
		delete process.env.PROXY_URL;
		delete process.env.NODE_ENV;
	});

	it("loads required config from environment", () => {
		process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
		process.env.REDIS_URL = "redis://:testpass@localhost:6379";

		const config = loadConfig();

		expect(config.databaseUrl).toBe("postgresql://test:test@localhost:5432/test");
		expect(config.redisUrl).toBe("redis://:testpass@localhost:6379");
	});

	it("throws on missing required DATABASE_URL", () => {
		process.env.REDIS_URL = "redis://:testpass@localhost:6379";
		expect(() => loadConfig()).toThrow();
	});

	it("throws on missing required REDIS_URL", () => {
		process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
		expect(() => loadConfig()).toThrow();
	});

	it("parses optional ENCRYPTION_KEY", () => {
		process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
		process.env.REDIS_URL = "redis://:testpass@localhost:6379";
		process.env.ENCRYPTION_KEY = "abc123";

		const config = loadConfig();
		expect(config.encryptionKey).toBe("abc123");
	});

	it("returns undefined for optional fields when not set", () => {
		process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
		process.env.REDIS_URL = "redis://:testpass@localhost:6379";

		const config = loadConfig();
		expect(config.encryptionKey).toBeUndefined();
		expect(config.proxyUrl).toBeUndefined();
	});

	it("defaults nodeEnv to development", () => {
		process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
		process.env.REDIS_URL = "redis://:testpass@localhost:6379";

		const config = loadConfig();
		expect(config.nodeEnv).toBe("development");
	});
});

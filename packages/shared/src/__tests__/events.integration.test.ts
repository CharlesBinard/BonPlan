import { afterAll, describe, expect, it } from "bun:test";
import { createRedis } from "../db/redis";
import { deadLetterStream, publish, Stream, subscribe } from "../events";
import { createLogger } from "../logger";

const REDIS_URL = process.env.REDIS_URL ?? "redis://:redis_dev@localhost:6379";

describe("events integration", () => {
	const redis = createRedis(REDIS_URL);
	const subscriberRedis = createRedis(REDIS_URL);
	const logger = createLogger("test");

	afterAll(async () => {
		await redis.del(Stream.SearchCreated);
		await redis.del(deadLetterStream("test-service"));
		const retryKeys = await redis.keys("retry:*");
		if (retryKeys.length > 0) await redis.del(...retryKeys);
		redis.disconnect();
		subscriberRedis.disconnect();
	});

	it("publishes and subscribes to a stream", async () => {
		const received: { searchId: string; userId: string }[] = [];

		const { stop } = await subscribe(
			subscriberRedis,
			Stream.SearchCreated,
			"test-group",
			"test-consumer-1",
			async (payload) => {
				received.push(payload);
			},
			{ logger, serviceName: "test-service" },
		);

		const messageId = await publish(redis, Stream.SearchCreated, {
			searchId: "search-123",
			userId: "user-456",
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");

		const deadline = Date.now() + 5000;
		while (received.length === 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		expect(received.length).toBe(1);
		expect(received[0]?.searchId).toBe("search-123");
		expect(received[0]?.userId).toBe("user-456");

		stop();
	});

	it("moves failing messages to dead letter after max retries", { timeout: 20_000 }, async () => {
		let callCount = 0;

		const { stop } = await subscribe(
			subscriberRedis,
			Stream.SearchCreated,
			"test-dl-group",
			"test-dl-consumer",
			async () => {
				callCount++;
				throw new Error("intentional failure");
			},
			{
				logger,
				serviceName: "test-service",
				maxRetries: 2,
				pelCheckIntervalMs: 500,
				pelIdleThresholdMs: 1000,
			},
		);

		await publish(redis, Stream.SearchCreated, {
			searchId: "search-fail",
			userId: "user-fail",
		});

		const deadline = Date.now() + 15000;
		let hasDlMessage = false;
		while (!hasDlMessage && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			const dlMessages = await redis.xrange(deadLetterStream("test-service"), "-", "+");
			hasDlMessage = dlMessages.some(([, fields]) => {
				const dataIdx = fields.indexOf("data");
				if (dataIdx === -1) return false;
				const data = fields[dataIdx + 1];
				return data?.includes("search-fail");
			});
		}

		expect(hasDlMessage).toBe(true);
		expect(callCount).toBeGreaterThanOrEqual(2);

		stop();
	});
});

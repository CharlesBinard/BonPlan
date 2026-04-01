import { describe, expect, it } from "bun:test";
import { createRedis } from "../db/redis";

describe("createRedis", () => {
	it("exports a createRedis function", () => {
		expect(typeof createRedis).toBe("function");
	});

	it("connects to Redis and responds to ping", async () => {
		const redis = createRedis("redis://:redis_dev@localhost:6379");
		const pong = await redis.ping();
		expect(pong).toBe("PONG");
		redis.disconnect();
	});
});

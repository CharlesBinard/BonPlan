import Redis from "ioredis";

export const createRedis = (redisUrl: string): Redis => {
	return new Redis(redisUrl, {
		maxRetriesPerRequest: 3,
		retryStrategy(times: number): number {
			return Math.min(times * 200, 5000);
		},
	});
};

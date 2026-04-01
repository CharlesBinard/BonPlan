import { createMiddleware } from "hono/factory";

type RateLimitEntry = { count: number; resetAt: number };

const createStore = (): Map<string, RateLimitEntry> => {
	const store = new Map<string, RateLimitEntry>();
	setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of store) {
			if (now > entry.resetAt) store.delete(key);
		}
	}, 60_000).unref();
	return store;
};

type RateLimitOptions = {
	windowMs: number;
	maxRequests: number;
	keyFn: (c: { req: { header: (name: string) => string | undefined }; get: (key: string) => string }) => string;
};

export const rateLimit = (options: RateLimitOptions) => {
	const store = createStore();

	return createMiddleware(async (c, next) => {
		const key = options.keyFn(c as Parameters<typeof options.keyFn>[0]);
		const now = Date.now();
		const entry = store.get(key);

		if (!entry || now > entry.resetAt) {
			store.set(key, { count: 1, resetAt: now + options.windowMs });
			await next();
			return;
		}

		if (entry.count >= options.maxRequests) {
			return c.json({ error: "rate_limit_exceeded" }, 429);
		}

		entry.count++;
		await next();
	});
};

export const ipRateLimit = (maxRequests: number, windowMs: number = 60_000) =>
	rateLimit({
		windowMs,
		maxRequests,
		keyFn: (c) => `ip:${c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown"}`,
	});

export const userRateLimit = (maxRequests: number, windowMs: number = 60_000) =>
	rateLimit({
		windowMs,
		maxRequests,
		keyFn: (c) => `user:${c.get("userId")}`,
	});

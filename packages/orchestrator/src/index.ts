import { createDb, createLogger, createRedis, loadConfig, publish, Stream, searches } from "@bonplan/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import { startConsumers } from "./consumers";
import { cancelAllResumeTimers, registerResumeTimer } from "./lib/resume-timers";
import { withSearchLock } from "./lib/search-lock";
import { Scheduler } from "./services/scheduler";
import { Semaphore } from "./services/semaphore";

const config = loadConfig();
const logger = createLogger("orchestrator");

if (!config.encryptionKey) {
	throw new Error("ENCRYPTION_KEY is required for the orchestrator");
}

const { db } = createDb(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const semaphore = new Semaphore(2);
const scheduler = new Scheduler({
	onTrigger: async (searchId, userId) => {
		await publish(redis, Stream.SearchTrigger, { searchId, userId });
		logger.info("Search trigger published", { searchId });
	},
	semaphore,
});

const rebuildScheduler = async (): Promise<void> => {
	// Active searches -> schedule normally
	const activeSearches = await db.select().from(searches).where(eq(searches.status, "active"));

	for (const search of activeSearches) {
		scheduler.add(search.id, search.userId, search.intervalMin);
	}

	// Paused searches with blocked_until -> schedule auto-resume
	const pausedSearches = await db
		.select()
		.from(searches)
		.where(and(eq(searches.status, "paused"), isNotNull(searches.blockedUntil)));

	const now = Date.now();
	for (const search of pausedSearches) {
		if (!search.blockedUntil) continue; // TypeScript narrowing guard
		const remainingMs = search.blockedUntil.getTime() - now;

		if (remainingMs <= 0) {
			// Already past blocked_until -> resume immediately
			await db
				.update(searches)
				.set({ status: "active", blockedUntil: null, updatedAt: new Date() })
				.where(eq(searches.id, search.id));
			scheduler.add(search.id, search.userId, search.intervalMin);
			logger.info("Resumed previously paused search (blocked_until passed)", {
				searchId: search.id,
			});
		} else {
			// Still in cooldown -> schedule auto-resume for remaining time
			const timer = setTimeout(async () => {
				await withSearchLock(search.id, async () => {
					try {
						await db
							.update(searches)
							.set({ status: "active", blockedUntil: null, updatedAt: new Date() })
							.where(eq(searches.id, search.id));
						scheduler.add(search.id, search.userId, search.intervalMin);
						logger.info("Search auto-resumed after rebuild", { searchId: search.id });
					} catch (err) {
						const error = err instanceof Error ? err : new Error(String(err));
						logger.error("Auto-resume after rebuild failed", {
							searchId: search.id,
							error: error.message,
						});
					}
				});
			}, remainingMs);

			if (typeof timer === "object" && "unref" in timer) {
				(timer as NodeJS.Timeout).unref();
			}
			// Track timer so it can be cancelled on delete/shutdown
			registerResumeTimer(search.id, timer);
		}
	}

	logger.info("Scheduler rebuilt from database", {
		activeSearches: activeSearches.length,
		pausedWithBlockedUntil: pausedSearches.filter((s) => s.blockedUntil).length,
	});
};

const main = async (): Promise<void> => {
	await rebuildScheduler();

	const consumers = await startConsumers({ db, redis, config, scheduler });

	logger.info("Orchestrator running", {
		activeSearches: scheduler.size,
		maxConcurrent: 2,
	});

	const shutdown = async (): Promise<void> => {
		logger.info("Orchestrator shutting down");
		await consumers.stop();
		scheduler.destroy();
		cancelAllResumeTimers();
		redis.disconnect();
		process.exit(0);
	};

	process.on("SIGINT", () => {
		shutdown().catch((err) => logger.error("Shutdown error", { error: String(err) }));
	});
	process.on("SIGTERM", () => {
		shutdown().catch((err) => logger.error("Shutdown error", { error: String(err) }));
	});
};

main().catch((err) => {
	logger.error("Orchestrator failed to start", { error: String(err) });
	process.exit(1);
});

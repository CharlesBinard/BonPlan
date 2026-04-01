import { createLogger, publish, Stream, searches } from "@bonplan/shared";
import { eq } from "drizzle-orm";
import { deleteBlockCount, incrementBlockCount } from "../lib/block-tracker";
import { cancelResumeTimer, deleteResumeTimer, registerResumeTimer } from "../lib/resume-timers";
import type { ConsumerDeps } from "../types";

const logger = createLogger("orchestrator");

export const handleSearchBlocked = async (
	deps: ConsumerDeps,
	searchId: string,
	userId: string,
	reason: string,
	retryAfter: number,
): Promise<void> => {
	const { db, redis } = deps;

	// Cancel any existing resume timer for this search
	cancelResumeTimer(searchId);

	const currentBlocks = incrementBlockCount(searchId);

	if (currentBlocks >= 3) {
		// Permanent block
		await db
			.update(searches)
			.set({
				status: "blocked",
				lastError: `Blocked after 3 consecutive failures. Last reason: ${reason}`,
				updatedAt: new Date(),
			})
			.where(eq(searches.id, searchId));
		deps.scheduler.remove(searchId);
		deleteBlockCount(searchId);

		await publish(redis, Stream.SearchError, {
			searchId,
			userId,
			source: "orchestrator",
			error: "Search permanently blocked after 3 consecutive failures",
			errorType: "blocked_permanent",
		});

		logger.security("search_permanently_blocked", {
			searchId,
			userId,
			consecutiveBlocks: currentBlocks,
		});
		return;
	}

	// Temporary block with auto-recovery
	const blockedUntil = new Date(Date.now() + retryAfter * 1000);
	await db
		.update(searches)
		.set({
			status: "paused",
			blockedUntil,
			lastError: `Blocked: ${reason}. Retrying after ${retryAfter}s`,
			updatedAt: new Date(),
		})
		.where(eq(searches.id, searchId));
	deps.scheduler.remove(searchId);

	// Schedule auto-resume (tracked so it can be cancelled)
	const timer = setTimeout(async () => {
		deleteResumeTimer(searchId);
		try {
			const [search] = await db.select().from(searches).where(eq(searches.id, searchId));
			if (search && search.status === "paused") {
				await db
					.update(searches)
					.set({ status: "active", blockedUntil: null, updatedAt: new Date() })
					.where(eq(searches.id, searchId));
				deps.scheduler.add(searchId, userId, search.intervalMin);
				logger.info("Search auto-resumed after block", { searchId });
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error("Auto-resume failed", { searchId, error: error.message });
		}
	}, retryAfter * 1000);

	if (typeof timer === "object" && "unref" in timer) {
		(timer as NodeJS.Timeout).unref();
	}

	registerResumeTimer(searchId, timer);

	logger.warn("Search temporarily blocked", {
		searchId,
		retryAfter,
		consecutiveBlocks: currentBlocks,
	});
};

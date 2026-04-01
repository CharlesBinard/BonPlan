import { createLogger, Stream, subscribe } from "@bonplan/shared";
import { handleSearchBlocked } from "./handlers/on-search-blocked";
import { handleSearchCreated } from "./handlers/on-search-created";
import { handleSearchDeleted } from "./handlers/on-search-deleted";
import { handleSearchUpdated } from "./handlers/on-search-updated";
import { withSearchLock } from "./lib/search-lock";
import type { ConsumerDeps } from "./types";

const logger = createLogger("orchestrator");

export const startConsumers = async (deps: ConsumerDeps): Promise<{ stop: () => Promise<void> }> => {
	const { redis } = deps;
	const consumerId = `orchestrator-${process.pid}`;
	const stops: Array<{ stop: () => Promise<void> }> = [];

	const sub1 = await subscribe(
		redis,
		Stream.SearchCreated,
		"orchestrator",
		consumerId,
		async (payload) => {
			await withSearchLock(payload.searchId, () => handleSearchCreated(deps, payload.searchId, payload.userId));
		},
		{ logger, serviceName: "orchestrator" },
	);
	stops.push(sub1);

	const sub2 = await subscribe(
		redis,
		Stream.SearchUpdated,
		"orchestrator",
		consumerId,
		async (payload) => {
			await withSearchLock(payload.searchId, () =>
				handleSearchUpdated(deps, payload.searchId, payload.userId, payload.changes),
			);
		},
		{ logger, serviceName: "orchestrator" },
	);
	stops.push(sub2);

	const sub3 = await subscribe(
		redis,
		Stream.SearchDeleted,
		"orchestrator",
		consumerId,
		async (payload) => {
			await withSearchLock(payload.searchId, () => handleSearchDeleted(deps, payload.searchId));
		},
		{ logger, serviceName: "orchestrator" },
	);
	stops.push(sub3);

	const sub4 = await subscribe(
		redis,
		Stream.SearchBlocked,
		"orchestrator",
		consumerId,
		async (payload) => {
			await withSearchLock(payload.searchId, () =>
				handleSearchBlocked(deps, payload.searchId, payload.userId, payload.reason, payload.retryAfter),
			);
		},
		{ logger, serviceName: "orchestrator" },
	);
	stops.push(sub4);

	return {
		stop: async () => {
			await Promise.all(stops.map((sub) => sub.stop()));
		},
	};
};

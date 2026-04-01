import { searches } from "@bonplan/shared";
import { eq } from "drizzle-orm";
import { deleteBlockCount } from "../lib/block-tracker";
import type { ConsumerDeps } from "../types";
import { handleSearchCreated } from "./on-search-created";

export const handleSearchUpdated = async (
	deps: ConsumerDeps,
	searchId: string,
	userId: string,
	changes: string[],
): Promise<void> => {
	const { db } = deps;

	const [search] = await db.select().from(searches).where(eq(searches.id, searchId));
	if (!search) return;

	// Query change -> re-run full AI mapping (handles scheduling too)
	// Check this FIRST to avoid redundant scheduler operations from status/interval branches
	if (changes.includes("query")) {
		await handleSearchCreated(deps, searchId, userId);
		return;
	}

	// Status change -> add/remove from scheduler
	if (changes.includes("status")) {
		if (search.status === "active") {
			deleteBlockCount(searchId);
			deps.scheduler.add(searchId, userId, search.intervalMin);
		} else {
			deps.scheduler.remove(searchId);
		}
	}

	// Interval change -> reschedule if active
	if (changes.includes("intervalMin") && search.status === "active") {
		deps.scheduler.add(searchId, userId, search.intervalMin);
	}
};

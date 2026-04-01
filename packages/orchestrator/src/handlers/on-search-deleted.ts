import { createLogger } from "@bonplan/shared";
import { deleteBlockCount } from "../lib/block-tracker";
import { cancelResumeTimer } from "../lib/resume-timers";
import type { ConsumerDeps } from "../types";

const logger = createLogger("orchestrator");

export const handleSearchDeleted = async (deps: ConsumerDeps, searchId: string): Promise<void> => {
	deps.scheduler.remove(searchId);
	deleteBlockCount(searchId);
	cancelResumeTimer(searchId);
	logger.info("Search removed from scheduler", { searchId });
};

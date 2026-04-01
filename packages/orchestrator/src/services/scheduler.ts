import { createLogger } from "@bonplan/shared";
import type { Semaphore } from "./semaphore";

const logger = createLogger("orchestrator");

type SchedulerOptions = {
	onTrigger: (searchId: string, userId: string) => Promise<void>;
	semaphore: Semaphore;
};

type ScheduledSearch = {
	searchId: string;
	userId: string;
	intervalMin: number;
	timer: ReturnType<typeof setTimeout> | null;
};

export class Scheduler {
	private searches = new Map<string, ScheduledSearch>();
	private readonly queue: Array<{ searchId: string; userId: string }> = [];
	private readonly onTrigger: SchedulerOptions["onTrigger"];
	private readonly semaphore: Semaphore;

	constructor(options: SchedulerOptions) {
		this.onTrigger = options.onTrigger;
		this.semaphore = options.semaphore;
	}

	get size(): number {
		return this.searches.size;
	}

	get queueSize(): number {
		return this.queue.length;
	}

	getEffectiveInterval(searchId: string): number {
		const search = this.searches.get(searchId);
		if (!search) return 15;
		return Math.max(search.intervalMin, this.searches.size * 2);
	}

	add(searchId: string, userId: string, intervalMin: number): void {
		this.remove(searchId);

		const entry: ScheduledSearch = {
			searchId,
			userId,
			intervalMin,
			timer: null,
		};
		this.searches.set(searchId, entry);
		this.scheduleNext(entry);

		logger.info("Search scheduled", { searchId, intervalMin });
	}

	remove(searchId: string): void {
		const entry = this.searches.get(searchId);
		if (entry?.timer) {
			clearTimeout(entry.timer);
		}
		this.searches.delete(searchId);
		const queueIdx = this.queue.findIndex((q) => q.searchId === searchId);
		if (queueIdx !== -1) this.queue.splice(queueIdx, 1);
	}

	enqueue(searchId: string, userId: string): void {
		if (this.queue.some((q) => q.searchId === searchId)) return;
		this.queue.push({ searchId, userId });
		this.processQueue();
	}

	async triggerNow(searchId: string, userId: string): Promise<void> {
		const release = await this.semaphore.acquire();
		try {
			await this.onTrigger(searchId, userId);
		} finally {
			release();
			this.processQueue();
		}
	}

	destroy(): void {
		for (const id of [...this.searches.keys()]) {
			this.remove(id);
		}
		this.queue.length = 0;
	}

	private scheduleNext(entry: ScheduledSearch): void {
		const effectiveMs = this.getEffectiveInterval(entry.searchId) * 60_000;

		entry.timer = setTimeout(() => {
			if (!this.searches.has(entry.searchId)) return;
			this.enqueue(entry.searchId, entry.userId);
			this.scheduleNext(entry);
		}, effectiveMs);

		if (entry.timer && typeof entry.timer === "object" && "unref" in entry.timer) {
			(entry.timer as NodeJS.Timeout).unref();
		}
	}

	private processQueue(): void {
		if (this.queue.length === 0) return;
		if (this.semaphore.inFlight >= this.semaphore.capacity) return;

		const next = this.queue.shift();

		if (next) {
			this.triggerNow(next.searchId, next.userId).catch((err) => {
				const error = err instanceof Error ? err : new Error(String(err));
				logger.error("Queued trigger failed", { searchId: next.searchId, error: error.message });
			});
		}
	}
}

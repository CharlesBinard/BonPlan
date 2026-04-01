import { beforeEach, describe, expect, it } from "bun:test";
import { Scheduler } from "../services/scheduler";
import { Semaphore } from "../services/semaphore";

describe("Scheduler", () => {
	let triggered: Array<{ searchId: string; userId: string }>;
	let semaphore: Semaphore;
	let scheduler: Scheduler;

	beforeEach(() => {
		triggered = [];
		semaphore = new Semaphore(2);
		scheduler = new Scheduler({
			onTrigger: async (searchId, userId) => {
				triggered.push({ searchId, userId });
			},
			semaphore,
		});
	});

	it("adds and removes searches", () => {
		scheduler.add("s1", "u1", 15);
		expect(scheduler.size).toBe(1);
		scheduler.remove("s1");
		expect(scheduler.size).toBe(0);
	});

	it("calculates effective interval dynamically", () => {
		scheduler.add("s1", "u1", 15);
		expect(scheduler.getEffectiveInterval("s1")).toBe(15);

		for (let i = 2; i <= 10; i++) {
			scheduler.add(`s${i}`, `u${i}`, 15);
		}
		expect(scheduler.getEffectiveInterval("s1")).toBe(20);
	});

	it("triggers immediately via triggerNow", async () => {
		await scheduler.triggerNow("s1", "u1");
		expect(triggered).toEqual([{ searchId: "s1", userId: "u1" }]);
	});

	it("deduplicates queue entries", async () => {
		// Fill semaphore so processQueue cannot drain entries immediately
		const r1 = await semaphore.acquire();
		const r2 = await semaphore.acquire();

		scheduler.enqueue("s1", "u1");
		scheduler.enqueue("s1", "u1");
		scheduler.enqueue("s2", "u2");
		expect(scheduler.queueSize).toBe(2);

		r1();
		r2();
	});

	it("stops all timers on destroy", () => {
		scheduler.add("s1", "u1", 15);
		scheduler.add("s2", "u2", 15);
		scheduler.destroy();
		expect(scheduler.size).toBe(0);
		expect(scheduler.queueSize).toBe(0);
	});
});

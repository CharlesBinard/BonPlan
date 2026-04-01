import { describe, expect, it } from "bun:test";
import { Semaphore } from "../services/semaphore";

describe("Semaphore", () => {
	it("allows up to maxConcurrent simultaneous acquisitions", async () => {
		const sem = new Semaphore(2);
		let concurrent = 0;
		let maxSeen = 0;

		const task = async (): Promise<void> => {
			const release = await sem.acquire();
			concurrent++;
			maxSeen = Math.max(maxSeen, concurrent);
			await new Promise((r) => setTimeout(r, 50));
			concurrent--;
			release();
		};

		await Promise.all(Array.from({ length: 10 }, () => task()));
		expect(maxSeen).toBe(2);
	});

	it("queues excess acquisitions in order", async () => {
		const sem = new Semaphore(1);
		const order: number[] = [];

		const task = async (id: number): Promise<void> => {
			const release = await sem.acquire();
			order.push(id);
			await new Promise((r) => setTimeout(r, 10));
			release();
		};

		await Promise.all([task(1), task(2), task(3)]);
		expect(order).toEqual([1, 2, 3]);
	});

	it("reports current count and capacity", async () => {
		const sem = new Semaphore(3);
		expect(sem.inFlight).toBe(0);
		expect(sem.capacity).toBe(3);

		const release1 = await sem.acquire();
		expect(sem.inFlight).toBe(1);

		const release2 = await sem.acquire();
		expect(sem.inFlight).toBe(2);

		release1();
		expect(sem.inFlight).toBe(1);

		release2();
		expect(sem.inFlight).toBe(0);
	});
});

export class Semaphore {
	private current = 0;
	private readonly max: number;
	private readonly waiters: Array<() => void> = [];

	constructor(maxConcurrent: number) {
		this.max = maxConcurrent;
	}

	get inFlight(): number {
		return this.current;
	}

	get capacity(): number {
		return this.max;
	}

	async acquire(): Promise<() => void> {
		if (this.current < this.max) {
			this.current++;
			return this.createRelease();
		}

		return new Promise<() => void>((resolve) => {
			this.waiters.push(() => {
				this.current++;
				resolve(this.createRelease());
			});
		});
	}

	private createRelease(): () => void {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.current--;
			const next = this.waiters.shift();
			if (next) {
				next();
			}
		};
	}
}

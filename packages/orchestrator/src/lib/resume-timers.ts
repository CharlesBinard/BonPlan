const resumeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const cancelResumeTimer = (searchId: string): void => {
	const timer = resumeTimers.get(searchId);
	if (timer) {
		clearTimeout(timer);
		resumeTimers.delete(searchId);
	}
};

export const cancelAllResumeTimers = (): void => {
	for (const id of [...resumeTimers.keys()]) {
		cancelResumeTimer(id);
	}
};

export const registerResumeTimer = (searchId: string, timer: ReturnType<typeof setTimeout>): void => {
	cancelResumeTimer(searchId); // cancel any existing timer first
	resumeTimers.set(searchId, timer);
};

export const deleteResumeTimer = (searchId: string): void => {
	resumeTimers.delete(searchId);
};

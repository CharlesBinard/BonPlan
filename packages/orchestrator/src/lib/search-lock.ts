const searchLocks = new Map<string, Promise<void>>();

export const withSearchLock = async (searchId: string, fn: () => Promise<void>): Promise<void> => {
	const existing = searchLocks.get(searchId) ?? Promise.resolve();
	const next = existing.then(fn, fn); // chain regardless of success/failure
	searchLocks.set(searchId, next);
	try {
		await next;
	} finally {
		// Clean up if this is still the latest
		if (searchLocks.get(searchId) === next) {
			searchLocks.delete(searchId);
		}
	}
};

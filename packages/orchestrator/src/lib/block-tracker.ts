const blockCounts = new Map<string, number>();

export const incrementBlockCount = (searchId: string): number => {
	const current = (blockCounts.get(searchId) ?? 0) + 1;
	blockCounts.set(searchId, current);
	return current;
};

export const getBlockCount = (searchId: string): number => {
	return blockCounts.get(searchId) ?? 0;
};

export const deleteBlockCount = (searchId: string): void => {
	blockCounts.delete(searchId);
};

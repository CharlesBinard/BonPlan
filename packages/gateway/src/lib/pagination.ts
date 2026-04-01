type CursorData = {
	value: string;
	id: string;
};

export const encodeCursor = (value: string, id: string): string => {
	return Buffer.from(JSON.stringify({ value, id })).toString("base64url");
};

export const decodeCursor = (cursor: string | undefined): CursorData | null => {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()) as Record<string, unknown>;
		if (typeof parsed.value === "string" && typeof parsed.id === "string") {
			return { value: parsed.value, id: parsed.id };
		}
		return null;
	} catch {
		return null;
	}
};

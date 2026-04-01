import { describe, expect, it } from "bun:test";
import { decodeCursor, encodeCursor } from "../lib/pagination";

describe("pagination", () => {
	it("encodes and decodes a cursor round-trip", () => {
		const cursor = encodeCursor("2026-03-27T10:00:00Z", "uuid-123");
		expect(typeof cursor).toBe("string");
		const decoded = decodeCursor(cursor);
		expect(decoded).toEqual({ value: "2026-03-27T10:00:00Z", id: "uuid-123" });
	});

	it("returns null for undefined cursor", () => {
		expect(decodeCursor(undefined)).toBeNull();
	});

	it("returns null for invalid cursor", () => {
		expect(decodeCursor("not-valid")).toBeNull();
	});

	it("produces opaque base64url strings", () => {
		const cursor = encodeCursor("100", "abc");
		expect(cursor).not.toContain("{");
		expect(() => Buffer.from(cursor, "base64url").toString()).not.toThrow();
	});
});

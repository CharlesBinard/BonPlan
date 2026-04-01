import { describe, expect, it } from "bun:test";
import { decrypt, encrypt } from "../crypto";

describe("crypto", () => {
	const testKey = "a".repeat(64);

	it("encrypts and decrypts a string round-trip", () => {
		const plaintext = "sk-ant-api-key-12345";
		const encrypted = encrypt(plaintext, testKey, 1);
		expect(encrypted).not.toBe(plaintext);
		expect(typeof encrypted).toBe("string");
		const decrypted = decrypt(encrypted, { 1: testKey });
		expect(decrypted).toBe(plaintext);
	});

	it("handles empty string", () => {
		const encrypted = encrypt("", testKey, 1);
		const decrypted = decrypt(encrypted, { 1: testKey });
		expect(decrypted).toBe("");
	});

	it("handles long input with special characters", () => {
		const plaintext = `sk-ant-api-key-🔑-${"x".repeat(1000)}`;
		const encrypted = encrypt(plaintext, testKey, 1);
		const decrypted = decrypt(encrypted, { 1: testKey });
		expect(decrypted).toBe(plaintext);
	});

	it("encrypted output starts with version byte 1 when decoded", () => {
		const encrypted = encrypt("test", testKey, 1);
		const buffer = Buffer.from(encrypted, "base64");
		expect(buffer[0]).toBe(1);
	});

	it("uses different nonces for each encryption", () => {
		const e1 = encrypt("same-input", testKey, 1);
		const e2 = encrypt("same-input", testKey, 1);
		expect(e1).not.toBe(e2);
	});

	it("decrypts with correct key version during rotation", () => {
		const keyV1 = "a".repeat(64);
		const keyV2 = "b".repeat(64);
		const encryptedV1 = encrypt("secret-v1", keyV1, 1);
		const encryptedV2 = encrypt("secret-v2", keyV2, 2);
		const keys = { 1: keyV1, 2: keyV2 };
		expect(decrypt(encryptedV1, keys)).toBe("secret-v1");
		expect(decrypt(encryptedV2, keys)).toBe("secret-v2");
	});

	it("throws on wrong key", () => {
		const encrypted = encrypt("secret", testKey, 1);
		const wrongKey = "b".repeat(64);
		expect(() => decrypt(encrypted, { 1: wrongKey })).toThrow();
	});

	it("throws on unknown version", () => {
		const encrypted = encrypt("secret", testKey, 1);
		expect(() => decrypt(encrypted, { 2: testKey })).toThrow("Unknown encryption key version: 1");
	});

	it("throws on invalid version number (> 255)", () => {
		expect(() => encrypt("secret", testKey, 300)).toThrow("Version must be an integer between 1 and 255");
	});

	it("throws on invalid version number (0)", () => {
		expect(() => encrypt("secret", testKey, 0)).toThrow("Version must be an integer between 1 and 255");
	});

	it("throws on non-integer version number", () => {
		expect(() => encrypt("secret", testKey, 1.5)).toThrow("Version must be an integer between 1 and 255");
	});

	it("throws on invalid hex key length", () => {
		expect(() => encrypt("secret", "abcd", 1)).toThrow("Key must be 64 hex characters (32 bytes)");
	});

	it("throws on non-hex key (right length but invalid characters)", () => {
		expect(() => encrypt("secret", "z".repeat(64), 1)).toThrow("Key must be 64 hex characters (32 bytes)");
	});

	it("throws on short encrypted string with a clear message", () => {
		const shortBase64 = Buffer.from("tooshort").toString("base64");
		expect(() => decrypt(shortBase64, { 1: testKey })).toThrow(/envelope too short/);
	});

	it("throws on empty encrypted string with a clear message", () => {
		const emptyBase64 = Buffer.alloc(0).toString("base64");
		expect(() => decrypt(emptyBase64, { 1: testKey })).toThrow(/envelope too short/);
	});
});

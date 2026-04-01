import { describe, expect, test } from "bun:test";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "../errors";

describe("AiAuthError", () => {
	test("is an instance of Error", () => {
		const err = new AiAuthError("Invalid API key");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(AiAuthError);
		expect(err.message).toBe("Invalid API key");
		expect(err.name).toBe("AiAuthError");
	});
});

describe("AiQuotaError", () => {
	test("is an instance of Error", () => {
		const err = new AiQuotaError("Quota exhausted");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(AiQuotaError);
		expect(err.name).toBe("AiQuotaError");
	});
});

describe("AiRateLimitError", () => {
	test("stores retryAfterMs", () => {
		const err = new AiRateLimitError("Rate limited", 5000);
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(AiRateLimitError);
		expect(err.retryAfterMs).toBe(5000);
		expect(err.name).toBe("AiRateLimitError");
	});

	test("retryAfterMs is optional", () => {
		const err = new AiRateLimitError("Rate limited");
		expect(err.retryAfterMs).toBeUndefined();
	});
});

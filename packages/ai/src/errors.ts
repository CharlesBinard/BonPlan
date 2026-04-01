export class AiAuthError extends Error {
	override name = "AiAuthError";
}

export class AiQuotaError extends Error {
	override name = "AiQuotaError";
}

export class AiRateLimitError extends Error {
	override name = "AiRateLimitError";
	retryAfterMs?: number;
	constructor(message: string, retryAfterMs?: number, options?: { cause?: unknown }) {
		super(message, options);
		this.retryAfterMs = retryAfterMs;
	}
}

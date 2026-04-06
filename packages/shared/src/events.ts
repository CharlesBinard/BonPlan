import type Redis from "ioredis";
import type { Logger } from "./logger";
import type { AiContext } from "./types";

export enum Stream {
	SearchCreated = "search.created",
	SearchUpdated = "search.updated",
	SearchDeleted = "search.deleted",
	SearchMapped = "search.mapped",
	SearchTrigger = "search.trigger",
	SearchError = "search.error",
	SearchBlocked = "search.blocked",
	ListingsFound = "listings.found",
	ListingAnalyzed = "listing.analyzed",
	ImageAnalysisComplete = "image.analysis.complete",
	NotificationSent = "notification.sent",
}

export const STREAM_MAX_LEN = 10000;
export const DEAD_LETTER_MAX_LEN = 1000;
const PEL_CHECK_INTERVAL_MS = 60_000;
const PEL_IDLE_THRESHOLD_MS = 300_000;
const DEFAULT_MAX_RETRIES = 3;

export const deadLetterStream = (serviceName: string): string => `dead-letter.${serviceName}`;

// Note: SearchBlockedPayload.retryAfter is a number (seconds).
// The gateway converts it to an ISO string when relaying to WsMessage for the frontend.
export type SearchCreatedPayload = { searchId: string; userId: string };
export type SearchUpdatedPayload = { searchId: string; userId: string; changes: string[] };
export type SearchDeletedPayload = { searchId: string };
export type SearchMappedPayload = { searchId: string; userId: string; aiContext: AiContext };
export type SearchTriggerPayload = { searchId: string; userId: string };
export type SearchErrorPayload = { searchId: string; userId: string; source: string; error: string; errorType: string };
export type SearchBlockedPayload = { searchId: string; userId: string; reason: string; retryAfter: number };
export type ListingsFoundPayload = { searchId: string; userId: string; listingIds: string[] };
export type ListingAnalyzedPayload = {
	searchId: string;
	userId: string;
	listingId: string;
	analysisId: string;
	score: number;
	verdict: string;
};
export type ImageAnalysisCompletePayload = {
	searchId: string;
	userId: string;
	listingId: string;
	originalScore: number;
	adjustedScore: number;
};
export type NotificationSentPayload = { notificationId: string; userId: string; channel: string; status: string };

type StreamPayloadMap = {
	[Stream.SearchCreated]: SearchCreatedPayload;
	[Stream.SearchUpdated]: SearchUpdatedPayload;
	[Stream.SearchDeleted]: SearchDeletedPayload;
	[Stream.SearchMapped]: SearchMappedPayload;
	[Stream.SearchTrigger]: SearchTriggerPayload;
	[Stream.SearchError]: SearchErrorPayload;
	[Stream.SearchBlocked]: SearchBlockedPayload;
	[Stream.ListingsFound]: ListingsFoundPayload;
	[Stream.ListingAnalyzed]: ListingAnalyzedPayload;
	[Stream.ImageAnalysisComplete]: ImageAnalysisCompletePayload;
	[Stream.NotificationSent]: NotificationSentPayload;
};

const retryKey = (stream: string, messageId: string): string => `retry:${stream}:${messageId}`;
const RETRY_KEY_TTL = 86400;

const incrementRetryCount = async (redis: Redis, stream: string, messageId: string): Promise<number> => {
	const key = retryKey(stream, messageId);
	const newCount = await redis.incr(key);
	await redis.expire(key, RETRY_KEY_TTL);
	return newCount;
};

const cleanupRetryKey = async (redis: Redis, stream: string, messageId: string): Promise<void> => {
	await redis.del(retryKey(stream, messageId));
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const publish = async <S extends Stream>(
	redis: Redis,
	stream: S,
	payload: StreamPayloadMap[S],
): Promise<string> => {
	const messageId = await redis.xadd(
		stream,
		"MAXLEN",
		"~",
		String(STREAM_MAX_LEN),
		"*",
		"data",
		JSON.stringify(payload),
	);
	if (messageId === null) throw new Error("xadd returned null");
	return messageId;
};

type MessageHandler<S extends Stream> = (payload: StreamPayloadMap[S], messageId: string) => Promise<void>;

type SubscribeOptions = {
	maxRetries?: number;
	logger?: Logger;
	serviceName?: string;
	pelCheckIntervalMs?: number;
	pelIdleThresholdMs?: number;
};

export const subscribe = async <S extends Stream>(
	redis: Redis,
	stream: S,
	group: string,
	consumer: string,
	handler: MessageHandler<S>,
	options?: SubscribeOptions,
): Promise<{ stop: () => Promise<void> }> => {
	const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
	const logger = options?.logger;
	const serviceName = options?.serviceName ?? group;
	const pelCheckInterval = options?.pelCheckIntervalMs ?? PEL_CHECK_INTERVAL_MS;
	const pelIdleThreshold = options?.pelIdleThresholdMs ?? PEL_IDLE_THRESHOLD_MS;
	let running = true;

	try {
		await redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
	} catch (err) {
		const error = toError(err);
		if (!error.message.includes("BUSYGROUP")) throw error;
	}

	const dlStream = deadLetterStream(serviceName);

	const processMessage = async (messageId: string, fields: string[]): Promise<void> => {
		let data = "";
		for (let i = 0; i < fields.length; i += 2) {
			if (fields[i] === "data") data = fields[i + 1] ?? "";
		}

		try {
			const payload = JSON.parse(data);
			if (typeof payload !== "object" || payload === null) {
				logger?.error("Invalid payload format", { messageId, data });
				await redis.xack(stream, group, messageId);
				return;
			}
			await handler(payload as StreamPayloadMap[S], messageId);
			await redis.xack(stream, group, messageId);
			await cleanupRetryKey(redis, stream, messageId);
		} catch (err) {
			const error = toError(err);
			const retryCount = await incrementRetryCount(redis, stream, messageId);

			if (retryCount >= maxRetries) {
				const dlId = await redis.xadd(
					dlStream,
					"MAXLEN",
					"~",
					String(DEAD_LETTER_MAX_LEN),
					"*",
					"data",
					data,
					"_error",
					error.message,
					"_originalStream",
					stream,
					"_originalMessageId",
					messageId,
					"_retryCount",
					String(retryCount),
				);
				if (dlId === null) {
					logger?.error("Failed to write to dead letter queue", { stream, messageId });
					return;
				}
				await redis.xack(stream, group, messageId);
				await cleanupRetryKey(redis, stream, messageId);
				logger?.warn("Message moved to dead letter", {
					category: "dead_letter",
					stream,
					messageId,
					retryCount,
					error: error.message,
				});
			}
		}
	};

	const blockMs = Math.min(2000, pelCheckInterval);

	const readLoop = async (): Promise<void> => {
		while (running) {
			try {
				const results = (await redis.xreadgroup(
					"GROUP",
					group,
					consumer,
					"COUNT",
					"10",
					"BLOCK",
					String(blockMs),
					"STREAMS",
					stream,
					">",
				)) as Array<[string, Array<[string, string[]]>]> | null;
				if (!results) continue;
				for (const [, messages] of results) {
					for (const [messageId, fields] of messages) {
						await processMessage(messageId, fields);
					}
				}
			} catch (err) {
				if (!running) break;
				const error = toError(err);
				logger?.error("Stream read error", { stream, group, error: error.message });
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	};

	const pelLoop = async (): Promise<void> => {
		while (running) {
			try {
				const pending = await redis.xpending(stream, group, "-", "+", "100");
				for (const entry of pending) {
					const [messageId, , idleTime] = entry as [string, string, number, number];
					if (idleTime < pelIdleThreshold) continue;
					const claimed = (await redis.xclaim(stream, group, consumer, String(pelIdleThreshold), messageId)) as Array<
						[string, string[]]
					>;
					for (const [claimedId, fields] of claimed) {
						if (fields) {
							await processMessage(claimedId, fields);
						}
					}
				}
			} catch (err) {
				const error = toError(err);
				logger?.error("PEL recovery error", { stream, group, error: error.message });
			}
			await new Promise((resolve) => setTimeout(resolve, pelCheckInterval));
		}
	};

	const readLoopPromise = readLoop().catch((err) => {
		const error = toError(err);
		logger?.error("readLoop crashed", { stream, group, error: error.message });
	});
	const pelLoopPromise = pelLoop().catch((err) => {
		const error = toError(err);
		logger?.error("pelLoop crashed", { stream, group, error: error.message });
	});

	return {
		stop: async () => {
			running = false;
			const SHUTDOWN_TIMEOUT_MS = 5000;
			await Promise.race([
				Promise.all([readLoopPromise, pelLoopPromise]),
				new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
			]);
		},
	};
};

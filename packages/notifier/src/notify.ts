// packages/notifier/src/notify.ts

import type { Config } from "@bonplan/shared";
import { analyses, createLogger, listings, notifications, publish, Stream, searches, subscribe } from "@bonplan/shared";
import { and, eq, sql } from "drizzle-orm";
import type Redis from "ioredis";
import type { WebhookPayload } from "./webhook/webhook";
import { sendWebhook } from "./webhook/webhook";

const logger = createLogger("notifier");

type Db = ReturnType<typeof import("@bonplan/shared")["createDb"]>["db"];

type NotifyDeps = {
	db: Db;
	redis: Redis;
	config: Config;
};

const processNotification = async (
	deps: NotifyDeps,
	searchId: string,
	userId: string,
	listingId: string,
	analysisId: string,
	score: number,
	verdict: string,
): Promise<void> => {
	const { db, config } = deps;
	const isDev = config.nodeEnv !== "production";

	// Score IS NOT NULL guard (analyzer should not publish null scores, but defend)
	if (score === null || score === undefined) {
		logger.info("Null score, skipping notification", { listingId });
		return;
	}

	// Get search config
	const [search] = await db.select().from(searches).where(eq(searches.id, searchId));
	if (!search) return;

	// Min score filter
	if (score < search.minScore) {
		logger.info("Below threshold", { listingId, score, minScore: search.minScore });
		return;
	}

	// Get listing + analysis data
	const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
	if (!listing) return;
	const [analysis] = await db.select().from(analyses).where(eq(analyses.id, analysisId));

	// Build payload
	const payload: WebhookPayload = {
		title: listing.title,
		price: listing.price,
		priceFormatted: `${(listing.price / 100).toFixed(2)} EUR`,
		score,
		verdict,
		url: listing.url,
		image: listing.images[0] ?? null,
		searchQuery: search.query,
		marketPriceLow: analysis?.marketPriceLow ?? null,
		marketPriceHigh: analysis?.marketPriceHigh ?? null,
		location: listing.location ?? null,
		redFlags: analysis?.redFlags ?? [],
	};

	// ── Webhook ────────────────────────────────────────────────────
	if (search.notifyWebhook) {
		const webhookUrl = search.notifyWebhook;
		await sendToChannel(deps, "webhook", analysisId, searchId, userId, async () => {
			const result = await sendWebhook(webhookUrl, payload, userId, isDev);
			if (!result.success) {
				if (result.permanent) {
					// Permanent failure — persist and don't retry
					return { status: "failed" as const, error: result.error };
				}
				// Transient failure — throw to trigger stream retry
				throw new Error(result.error);
			}
			return { status: "sent" as const, error: null };
		});
	}
};

// "discord" kept in DB enum for historical display — new notifications always use "webhook"
const sendToChannel = async (
	deps: NotifyDeps,
	channel: "webhook",
	analysisId: string,
	searchId: string,
	userId: string,
	sendFn: () => Promise<{ status: "sent" | "failed"; error: string | null }>,
): Promise<void> => {
	const { db, redis } = deps;

	// Idempotency: skip if already sent
	const [existing] = await db
		.select({ status: notifications.status })
		.from(notifications)
		.where(and(eq(notifications.analysisId, analysisId), eq(notifications.channel, channel)));

	if (existing?.status === "sent") {
		logger.info("Already sent, skipping", { analysisId, channel });
		return;
	}

	// Attempt send
	const { status, error } = await sendFn();

	// Persist notification (insert or update if retrying)
	await db
		.insert(notifications)
		.values({
			userId,
			searchId,
			analysisId,
			channel,
			status,
			retryCount: status === "failed" ? 1 : 0,
			payload: {} as Record<string, unknown>, // payload stored for debugging
			error,
		})
		.onConflictDoUpdate({
			target: [notifications.analysisId, notifications.channel],
			set: {
				status,
				error,
				retryCount: sql`${notifications.retryCount} + 1`,
			},
		});

	// Publish notification.sent
	const [notification] = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(and(eq(notifications.analysisId, analysisId), eq(notifications.channel, channel)));

	if (notification) {
		await publish(redis, Stream.NotificationSent, {
			notificationId: notification.id,
			userId,
			channel,
			status,
		});
	}

	if (status === "sent") {
		logger.info("Notification sent", { channel, analysisId });
	} else {
		logger.warn("Notification failed (permanent)", { channel, analysisId, error });
	}
};

// ── Event consumer ─────────────────────────────────────────────────

export const startNotificationConsumer = async (deps: NotifyDeps): Promise<{ stop: () => void }> => {
	const consumerId = `notifier-${process.pid}`;

	const sub = await subscribe(
		deps.redis,
		Stream.ListingAnalyzed,
		"notifier",
		consumerId,
		async (payload) => {
			// Transient errors THROW here → stream PEL retries (max 3) → dead letter
			// Permanent errors are handled inside processNotification (persisted, no throw)
			await processNotification(
				deps,
				payload.searchId,
				payload.userId,
				payload.listingId,
				payload.analysisId,
				payload.score,
				payload.verdict,
			);
		},
		{ logger, serviceName: "notifier", maxRetries: 3 },
	);

	return sub;
};

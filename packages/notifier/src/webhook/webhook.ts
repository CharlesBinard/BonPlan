// packages/notifier/src/webhook/webhook.ts
import { createLogger } from "@bonplan/shared";
import { validateWebhookIp, validateWebhookUrl } from "@bonplan/shared/ssrf";

const logger = createLogger("notifier");

export type WebhookPayload = {
	title: string;
	price: number;
	priceFormatted: string;
	score: number;
	verdict: string;
	url: string;
	image: string | null;
	searchQuery: string;
	marketPriceLow: number | null;
	marketPriceHigh: number | null;
};

export type SendResult = { success: true } | { success: false; error: string; permanent: boolean };

export const sendWebhook = async (
	webhookUrl: string,
	payload: WebhookPayload,
	userId: string,
	isDev: boolean,
): Promise<SendResult> => {
	const urlCheck = validateWebhookUrl(webhookUrl, isDev);
	if (!urlCheck.valid) {
		logger.security("invalid_webhook_url", { webhookUrl, reason: urlCheck.reason, userId });
		return { success: false, error: `invalid_webhook_url: ${urlCheck.reason}`, permanent: true };
	}

	const hostname = new URL(webhookUrl).hostname;
	if (hostname !== "localhost" && hostname !== "127.0.0.1") {
		const ipCheck = await validateWebhookIp(hostname, userId, webhookUrl);
		if (!ipCheck.valid) {
			return { success: false, error: `invalid_webhook_url: ${ipCheck.reason}`, permanent: true };
		}
	}

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(10000),
			redirect: "error",
		});

		if (!response.ok) {
			// 4xx except 408/429 are permanent
			const permanent =
				response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
			return { success: false, error: `HTTP ${response.status}`, permanent };
		}

		return { success: true };
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		return { success: false, error: error.message, permanent: false };
	}
};

/**
 * WebhookPayload — canonical type for webhook notification data.
 * Used by both the notifier (sendWebhook) and the gateway (webhook-test).
 */
export type WebhookPayload = {
	title: string;
	price: number; // cents
	priceFormatted: string;
	score: number;
	verdict: string;
	url: string;
	image: string | null;
	searchQuery: string;
	marketPriceLow: number | null; // cents
	marketPriceHigh: number | null; // cents
	location: string | null;
	redFlags: string[];
};

type DiscordEmbed = {
	title: string;
	description: string;
	color: number;
	url: string;
	thumbnail?: { url: string };
	footer: { text: string };
};

const DISCORD_WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\//;

export function isDiscordWebhookUrl(url: string): boolean {
	return DISCORD_WEBHOOK_RE.test(url);
}

const getScoreColor = (score: number): number => {
	if (score >= 90) return 0x2ecc71; // green
	if (score >= 70) return 0x3498db; // blue
	if (score >= 50) return 0xf1c40f; // yellow
	if (score >= 30) return 0xe67e22; // orange
	return 0xe74c3c; // red
};

const getScoreLabel = (score: number): string => {
	if (score >= 90) return "Affaire exceptionnelle !";
	if (score >= 70) return "Bonne affaire !";
	if (score >= 50) return "Prix correct";
	if (score >= 30) return "Surpayé ou partiel";
	return "Mauvaise affaire";
};

const fmtEur = (cents: number): string => (cents / 100).toFixed(2);

export function buildDiscordWebhookPayload(input: WebhookPayload): { embeds: DiscordEmbed[] } {
	let description = `**${input.title}** — ${input.priceFormatted}\n`;

	if (input.location) {
		description += `📍 ${input.location}\n`;
	}

	if (input.marketPriceLow !== null && input.marketPriceHigh !== null) {
		description += `Prix marché: ${fmtEur(input.marketPriceLow)}-${fmtEur(input.marketPriceHigh)} EUR\n`;
	}

	description += `Recherche: ${input.searchQuery}\n\n`;
	description += `**Verdict:** ${input.verdict}\n`;

	if (input.redFlags.length > 0) {
		description += `\n⚠️ **Red flags:** ${input.redFlags.join(", ")}\n`;
	}

	const embed: DiscordEmbed = {
		title: `Score ${input.score}/100 — ${getScoreLabel(input.score)}`,
		description,
		color: getScoreColor(input.score),
		url: input.url,
		footer: { text: "BonPlan — Leboncoin Deal Finder" },
	};

	if (input.image) {
		embed.thumbnail = { url: input.image };
	}

	return { embeds: [embed] };
}

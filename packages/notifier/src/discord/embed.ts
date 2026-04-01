// packages/notifier/src/discord/embed.ts
import { EmbedBuilder } from "discord.js";

type EmbedInput = {
	title: string;
	price: number; // cents
	score: number;
	verdict: string;
	url: string;
	image: string | null;
	location: string;
	searchQuery: string;
	marketPriceLow: number | null; // cents
	marketPriceHigh: number | null; // cents
	redFlags: string[];
};

export const getScoreColor = (score: number): number => {
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

export const buildListingEmbed = (input: EmbedInput): EmbedBuilder => {
	const priceEur = fmtEur(input.price);

	let description = `**${input.title}** — ${priceEur} EUR\n`;
	description += `Location: ${input.location}\n`;

	if (input.marketPriceLow !== null && input.marketPriceHigh !== null) {
		description += `Prix marché estimé: ${fmtEur(input.marketPriceLow)}-${fmtEur(input.marketPriceHigh)} EUR\n`;
	}

	description += `Correspond à: ${input.searchQuery}\n\n`;
	description += `**Verdict:** ${input.verdict}\n`;

	if (input.redFlags.length > 0) {
		description += `**Red flags:** ${input.redFlags.join(", ")}\n`;
	}

	const embed = new EmbedBuilder()
		.setTitle(`Score ${input.score}/100 — ${getScoreLabel(input.score)}`)
		.setDescription(description)
		.setColor(getScoreColor(input.score))
		.setURL(input.url)
		.setFooter({ text: "BonPlan — Leboncoin Deal Finder" });

	if (input.image) {
		embed.setThumbnail(input.image);
	}

	return embed;
};

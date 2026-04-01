// packages/notifier/src/__tests__/discord-embed.test.ts
import { describe, expect, it } from "bun:test";
import { buildListingEmbed, getScoreColor } from "../discord/embed";

describe("getScoreColor", () => {
	it("returns green for 90-100", () => expect(getScoreColor(95)).toBe(0x2ecc71));
	it("returns blue for 70-89", () => expect(getScoreColor(80)).toBe(0x3498db));
	it("returns yellow for 50-69", () => expect(getScoreColor(60)).toBe(0xf1c40f));
	it("returns orange for 30-49", () => expect(getScoreColor(40)).toBe(0xe67e22));
	it("returns red for 0-29", () => expect(getScoreColor(15)).toBe(0xe74c3c));
});

describe("buildListingEmbed", () => {
	it("builds embed with correct title, description, and color", () => {
		const embed = buildListingEmbed({
			title: "Seagate 10To",
			price: 12000,
			score: 87,
			verdict: "Good deal",
			url: "https://lbc.fr/12345",
			image: "https://img.lbc.fr/1.jpg",
			location: "Paris",
			searchQuery: "HDD 8-12To",
			marketPriceLow: 15000,
			marketPriceHigh: 18000,
			redFlags: [],
		});
		const data = embed.toJSON();
		expect(data.title).toContain("87/100");
		expect(data.description).toContain("Seagate 10To");
		expect(data.description).toContain("120.00 EUR");
		expect(data.color).toBe(0x3498db);
	});
});

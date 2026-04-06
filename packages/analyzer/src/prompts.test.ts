// packages/analyzer/src/prompts.test.ts
import { describe, expect, it } from "bun:test";
import { buildAnalysisPrompt, buildBatchAnalysisPrompt } from "./prompts";

const baseListing = {
	title: "RTX 4090 Gaming OC",
	price: 65000,
	description: "Très bon état",
	sellerType: "particulier",
	location: "Paris",
	images: ["img1.jpg"],
};

describe("buildAnalysisPrompt", () => {
	it("includes comparables field in JSON example", () => {
		const { system } = buildAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			listing: baseListing,
			marketContext: null,
		});
		expect(system).toContain('"comparables"');
	});

	it("instructs bullet-point verdicts", () => {
		const { system } = buildAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			listing: baseListing,
			marketContext: null,
		});
		expect(system).toContain("bullet");
	});

	it("includes market context when provided", () => {
		const { user } = buildAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			listing: baseListing,
			marketContext: 'Comparables trouvés pour "RTX 4090" :\n- backmarket.fr: "RTX 4090 OC" → 699€',
		});
		expect(user).toContain("backmarket.fr");
		expect(user).toContain("699€");
	});

	it("puts listing data in user message and calibration in system", () => {
		const prompt = buildAnalysisPrompt({
			searchQuery: "HDD 8-12To",
			judgmentCriteria: "Hard drive 8-12TB, good price",
			listing: {
				title: "Seagate IronWolf 10To",
				price: 15000,
				description: "NAS drive, barely used",
				sellerType: "particulier",
				location: "Paris",
				images: ["https://img.lbc.fr/1.jpg"],
			},
			marketContext: null,
		});

		// System: role + calibration, NOT listing data
		expect(prompt.system).toContain("scoring analyst");
		expect(prompt.system).toContain("90-100");
		expect(prompt.system).toContain("Score: 87");
		expect(prompt.system).toContain("Leboncoin.fr");
		expect(prompt.system).not.toContain("Seagate IronWolf");

		// System: anti-injection instruction
		expect(prompt.system).toContain("contenu non vérifié");

		// User: listing wrapped in <listing> tags + search criteria
		expect(prompt.user).toContain("<listing>");
		expect(prompt.user).toContain("</listing>");
		expect(prompt.user).toContain("Seagate IronWolf 10To");
		expect(prompt.user).toContain("HDD 8-12To");
		expect(prompt.user).toContain("Hard drive 8-12TB");
	});

	it("includes market context when provided", () => {
		const prompt = buildAnalysisPrompt({
			searchQuery: "HDD 10To",
			judgmentCriteria: "Hard drive 10TB",
			listing: {
				title: "WD Red 10To",
				price: 12000,
				description: "Good condition",
				sellerType: "pro",
				location: "Lyon",
				images: [],
			},
			marketContext: "SearXNG results: HDD 10To prix occasion found at 130-180 EUR on various sites",
		});

		expect(prompt.user).toContain("SearXNG results");
		expect(prompt.user).toContain("130-180 EUR");
	});

	it("formats price from cents to euros in prompt", () => {
		const prompt = buildAnalysisPrompt({
			searchQuery: "Test",
			judgmentCriteria: "Test",
			listing: {
				title: "Test Item",
				price: 15000,
				description: "desc",
				sellerType: "particulier",
				location: "Paris",
				images: [],
			},
			marketContext: null,
		});

		expect(prompt.user).toContain("150"); // 15000 cents = 150 EUR
	});
});

describe("buildBatchAnalysisPrompt", () => {
	it("includes comparables field in JSON example", () => {
		const { system } = buildBatchAnalysisPrompt({
			searchQuery: "RTX 4090",
			judgmentCriteria: "GPU seul",
			items: [{ id: 1, listing: baseListing }],
			marketContext: null,
		});
		expect(system).toContain('"comparables"');
	});
});

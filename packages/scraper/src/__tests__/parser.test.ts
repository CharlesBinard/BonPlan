// packages/scraper/src/parser.test.ts
import { describe, expect, it } from "bun:test";
import { checkForBlock, parseNextData } from "../parsing/parser";

// Sample __NEXT_DATA__ matching real LBC structure:
// props.pageProps.initialProps.searchData.ads
const sampleNextDataJson = {
	props: {
		pageProps: {
			initialProps: {
				searchData: {
					ads: [
						{
							list_id: 12345,
							subject: "Seagate IronWolf 10To",
							price: [150],
							price_cents: 15000,
							body: "Disque dur NAS 10To, peu utilisé",
							images: { urls: ["https://img.lbc.fr/1.jpg"] },
							url: "https://www.leboncoin.fr/informatique/12345.htm",
							owner: { type: "private" },
							location: { city: "Paris" },
						},
						{
							list_id: 67890,
							subject: "WD Red 8To",
							price: [110],
							body: "WD Red pour NAS",
							images: { urls: [] },
							url: "https://www.leboncoin.fr/informatique/67890.htm",
							owner: { type: "pro" },
							location: { city: "Lyon" },
						},
					],
				},
			},
		},
	},
};

describe("parseNextData", () => {
	it("extracts listings from __NEXT_DATA__ with correct path (initialProps)", () => {
		const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(sampleNextDataJson)}</script>`;
		const listings = parseNextData(html);

		expect(listings).toHaveLength(2);
		expect((listings[0] as (typeof listings)[number]).lbcId).toBe("12345");
		expect((listings[0] as (typeof listings)[number]).title).toBe("Seagate IronWolf 10To");
		expect((listings[0] as (typeof listings)[number]).sellerType).toBe("particulier");
	});

	it("converts prices to cents (uses price_cents if available, otherwise price * 100)", () => {
		const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(sampleNextDataJson)}</script>`;
		const listings = parseNextData(html);

		// First listing has price_cents: 15000
		expect((listings[0] as (typeof listings)[number]).price).toBe(15000);
		// Second listing has no price_cents, so price[0] * 100 = 110 * 100 = 11000
		expect((listings[1] as (typeof listings)[number]).price).toBe(11000);
	});

	it("returns empty array for missing __NEXT_DATA__", () => {
		expect(parseNextData("<html><body>No data</body></html>")).toEqual([]);
	});

	it("returns empty array for malformed JSON", () => {
		const html = '<script id="__NEXT_DATA__" type="application/json">not json</script>';
		expect(parseNextData(html)).toEqual([]);
	});

	it("handles missing price gracefully (defaults to 0)", () => {
		const data = {
			props: {
				pageProps: {
					initialProps: {
						searchData: {
							ads: [
								{
									list_id: 1,
									subject: "Test",
									price: [],
									body: "",
									images: { urls: [] },
									url: "https://lbc.fr/1",
									owner: { type: "private" },
									location: { city: "Paris" },
								},
							],
						},
					},
				},
			},
		};
		const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
		const listings = parseNextData(html);
		expect((listings[0] as (typeof listings)[number]).price).toBe(0);
	});

	it("handles missing owner gracefully (defaults to particulier)", () => {
		const data = {
			props: {
				pageProps: {
					initialProps: {
						searchData: {
							ads: [
								{
									list_id: 2,
									subject: "Test",
									price: [10],
									body: "",
									images: { urls: [] },
									url: "https://lbc.fr/2",
									location: { city: "Paris" },
								},
							],
						},
					},
				},
			},
		};
		const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
		const listings = parseNextData(html);
		expect((listings[0] as (typeof listings)[number]).sellerType).toBe("particulier");
	});
});

describe("checkForBlock", () => {
	it("detects HTTP 403", () => {
		expect(checkForBlock("", 403, "Forbidden").blocked).toBe(true);
	});

	it("detects HTTP 429", () => {
		expect(checkForBlock("", 429, "Too Many Requests").blocked).toBe(true);
	});

	it("detects captcha in title", () => {
		expect(checkForBlock("", 200, "Verification Required").blocked).toBe(true);
	});

	it("detects DataDome in HTML", () => {
		expect(checkForBlock('<iframe src="https://geo.captcha-delivery.com/captcha">', 200, "Leboncoin").blocked).toBe(
			true,
		);
	});

	it("returns not blocked for normal page", () => {
		expect(checkForBlock("<html>normal</html>", 200, "Leboncoin - Annonces").blocked).toBe(false);
	});
});

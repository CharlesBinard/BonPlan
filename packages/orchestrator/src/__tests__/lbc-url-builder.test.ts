import { describe, expect, test } from "bun:test";
import { buildLbcSearchUrl, buildLbcSearchUrls } from "../services/lbc-url-builder";

describe("buildLbcSearchUrl", () => {
	test("builds France-wide URL", () => {
		const url = buildLbcSearchUrl({ text: "5950x" });
		expect(url).toContain("text=5950x");
		expect(url).toContain("sort=time");
		expect(url).toContain("order=desc");
		expect(url).not.toContain("locations=");
		expect(url).not.toContain("category=");
	});

	test("builds localized URL", () => {
		const url = buildLbcSearchUrl({
			text: "iphone 15 pro",
			location: { city: "Paris", postcode: "75000", latitude: 48.8566, longitude: 2.3522 },
			radiusKm: 50,
		});
		expect(url).toContain("text=iphone+15+pro");
		expect(url).toContain("locations=Paris_75000__48.8566_2.3522_0_50000");
	});
});

describe("buildLbcSearchUrls", () => {
	test("builds one URL per keyword variation", () => {
		const urls = buildLbcSearchUrls(["5950x", "amd 5950x", "ryzen 5950x"], null, 30);
		expect(urls).toHaveLength(3);
		expect(urls[0]).toContain("text=5950x");
		expect(urls[1]).toContain("text=amd+5950x");
		expect(urls[2]).toContain("text=ryzen+5950x");
	});
});

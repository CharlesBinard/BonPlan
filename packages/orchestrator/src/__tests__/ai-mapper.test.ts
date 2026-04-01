import { describe, expect, it } from "bun:test";
import { buildMappingPrompt } from "../services/ai-mapper";

describe("ai-mapper", () => {
	it("buildMappingPrompt includes query, location, radius, and key instructions", () => {
		const prompt = buildMappingPrompt("HDD 8-12To", "Paris", 30);
		expect(prompt.user).toContain("HDD 8-12To");
		expect(prompt.user).toContain("Paris");
		expect(prompt.user).toContain("30");
		expect(prompt.system).toContain("keywordVariations");
		expect(prompt.system).toContain("Leboncoin");
		expect(prompt.system).toContain("JSON");
	});
});

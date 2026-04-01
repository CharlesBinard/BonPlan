import { describe, expect, test } from "bun:test";
import {
	AI_MODELS,
	AiModelTier,
	getDefaultModel,
	isValidModel,
	isValidProvider,
	PROVIDER_LABELS,
	PROVIDER_VALUES,
	ProviderType,
} from "../ai-models";

describe("ProviderType", () => {
	test("has exactly 4 providers", () => {
		expect(PROVIDER_VALUES).toHaveLength(4);
	});
	test("values match expected strings", () => {
		expect(ProviderType.Claude).toBe("claude");
		expect(ProviderType.OpenAI).toBe("openai");
		expect(ProviderType.Gemini).toBe("gemini");
		expect(ProviderType.Minimax).toBe("minimax");
	});
});

describe("AI_MODELS", () => {
	test("every provider has exactly 3 models", () => {
		for (const provider of PROVIDER_VALUES) {
			expect(AI_MODELS[provider as ProviderType]).toHaveLength(3);
		}
	});
	test("every provider has one model per tier", () => {
		for (const provider of PROVIDER_VALUES) {
			const tiers = AI_MODELS[provider as ProviderType].map((m) => m.tier);
			expect(tiers).toContain(AiModelTier.Fast);
			expect(tiers).toContain(AiModelTier.Balanced);
			expect(tiers).toContain(AiModelTier.Premium);
		}
	});
	test("every provider has exactly one recommended model", () => {
		for (const provider of PROVIDER_VALUES) {
			const recommended = AI_MODELS[provider as ProviderType].filter((m) => m.recommended);
			expect(recommended).toHaveLength(1);
		}
	});
});

describe("PROVIDER_LABELS", () => {
	test("has a label for every provider", () => {
		for (const provider of PROVIDER_VALUES) {
			expect(PROVIDER_LABELS[provider as ProviderType]).toBeDefined();
			expect(typeof PROVIDER_LABELS[provider as ProviderType]).toBe("string");
		}
	});
});

describe("getDefaultModel", () => {
	test("returns balanced model for each provider", () => {
		expect(getDefaultModel(ProviderType.Claude)).toBe("claude-sonnet-4-6");
		expect(getDefaultModel(ProviderType.OpenAI)).toBe("gpt-5.4-mini");
		expect(getDefaultModel(ProviderType.Gemini)).toBe("gemini-3-flash");
		expect(getDefaultModel(ProviderType.Minimax)).toBe("MiniMax-M2.5");
	});
});

describe("isValidProvider", () => {
	test("accepts valid providers", () => {
		expect(isValidProvider("claude")).toBe(true);
		expect(isValidProvider("openai")).toBe(true);
		expect(isValidProvider("gemini")).toBe(true);
		expect(isValidProvider("minimax")).toBe(true);
	});
	test("rejects invalid providers", () => {
		expect(isValidProvider("invalid")).toBe(false);
		expect(isValidProvider("")).toBe(false);
		expect(isValidProvider("Claude")).toBe(false);
	});
});

describe("isValidModel", () => {
	test("accepts valid model for provider", () => {
		expect(isValidModel(ProviderType.Claude, "claude-sonnet-4-6")).toBe(true);
		expect(isValidModel(ProviderType.Minimax, "MiniMax-M2.7")).toBe(true);
	});
	test("rejects model from wrong provider", () => {
		expect(isValidModel(ProviderType.Claude, "gpt-5.4")).toBe(false);
		expect(isValidModel(ProviderType.OpenAI, "claude-sonnet-4-6")).toBe(false);
	});
});

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { ProviderType } from "@bonplan/shared/ai-models";
import { APICallError, generateText, Output } from "ai";
import { createMinimax } from "vercel-minimax-ai-provider";
import type { z } from "zod";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "./errors";

const createModel = (providerType: ProviderType, apiKey: string, modelId: string) => {
	switch (providerType) {
		case ProviderType.Claude: {
			const anthropic = createAnthropic({ apiKey });
			return anthropic(modelId);
		}
		case ProviderType.OpenAI: {
			const openai = createOpenAI({ apiKey });
			return openai.chat(modelId);
		}
		case ProviderType.Gemini: {
			const google = createGoogleGenerativeAI({ apiKey });
			return google(modelId);
		}
		case ProviderType.Minimax: {
			const minimax = createMinimax({ apiKey });
			return minimax(modelId);
		}
		default:
			throw new Error(`Unknown provider: ${providerType satisfies never}`);
	}
};

const mapSdkError = (err: unknown): never => {
	if (APICallError.isInstance(err)) {
		if (err.statusCode === 401 || err.statusCode === 403) {
			throw new AiAuthError(err.message, { cause: err });
		}
		if (err.statusCode === 402) {
			throw new AiQuotaError(err.message, { cause: err });
		}
		if (err.statusCode === 429) {
			const retryAfter = err.responseHeaders?.["retry-after"];
			const retryAfterMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : undefined;
			throw new AiRateLimitError(err.message, retryAfterMs, { cause: err });
		}
	}

	const error = err instanceof Error ? err : new Error(String(err));
	const msg = error.message.toLowerCase();

	if (msg.includes("api key") || msg.includes("apikey") || msg.includes("authentication")) {
		throw new AiAuthError(error.message, { cause: error });
	}
	if (msg.includes("quota") || msg.includes("billing") || msg.includes("insufficient")) {
		throw new AiQuotaError(error.message, { cause: error });
	}

	throw error;
};

export const generateStructured = async <SCHEMA extends z.ZodType>(params: {
	providerType: ProviderType;
	apiKey: string;
	model: string;
	schema: SCHEMA;
	system: string;
	prompt: string;
	maxOutputTokens?: number;
}): Promise<{ data: z.infer<SCHEMA>; usage?: { inputTokens: number; outputTokens: number } }> => {
	const model = createModel(params.providerType, params.apiKey, params.model);

	try {
		const result = await generateText({
			model,
			output: Output.object({ schema: params.schema }),
			system: params.system,
			prompt: params.prompt,
			maxOutputTokens: params.maxOutputTokens,
		});

		if (!result.output) {
			throw new Error("No object generated: model did not produce structured output");
		}

		return {
			data: result.output as z.infer<SCHEMA>,
			usage: {
				inputTokens: result.usage.inputTokens ?? 0,
				outputTokens: result.usage.outputTokens ?? 0,
			},
		};
	} catch (err) {
		return mapSdkError(err);
	}
};

export const generateFreeText = async (params: {
	providerType: ProviderType;
	apiKey: string;
	model: string;
	system: string;
	prompt: string;
	maxOutputTokens?: number;
}): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> => {
	const model = createModel(params.providerType, params.apiKey, params.model);

	try {
		const result = await generateText({
			model,
			system: params.system,
			prompt: params.prompt,
			maxOutputTokens: params.maxOutputTokens,
		});

		return {
			text: result.text,
			usage: {
				inputTokens: result.usage.inputTokens ?? 0,
				outputTokens: result.usage.outputTokens ?? 0,
			},
		};
	} catch (err) {
		return mapSdkError(err);
	}
};

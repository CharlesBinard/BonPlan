export enum ProviderType {
	Claude = "claude",
	OpenAI = "openai",
	Gemini = "gemini",
	Minimax = "minimax",
}

export enum AiModelTier {
	Fast = "fast",
	Balanced = "balanced",
	Premium = "premium",
}

export type ModelOption = {
	id: string;
	label: string;
	tier: AiModelTier;
	recommended?: boolean;
	supportsVision?: boolean;
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
	[ProviderType.Claude]: "Claude (Anthropic)",
	[ProviderType.OpenAI]: "OpenAI",
	[ProviderType.Gemini]: "Gemini (Google)",
	[ProviderType.Minimax]: "MiniMax",
};

export const AI_MODELS: Record<ProviderType, ModelOption[]> = {
	[ProviderType.Claude]: [
		{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5", tier: AiModelTier.Fast, supportsVision: true },
		{
			id: "claude-sonnet-4-6",
			label: "Claude Sonnet 4.6",
			tier: AiModelTier.Balanced,
			recommended: true,
			supportsVision: true,
		},
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6", tier: AiModelTier.Premium, supportsVision: true },
	],
	[ProviderType.OpenAI]: [
		{ id: "gpt-5.4-nano", label: "GPT-5.4 Nano", tier: AiModelTier.Fast, supportsVision: true },
		{ id: "gpt-5.4-mini", label: "GPT-5.4 Mini", tier: AiModelTier.Balanced, recommended: true, supportsVision: true },
		{ id: "gpt-5.4", label: "GPT-5.4", tier: AiModelTier.Premium, supportsVision: true },
	],
	[ProviderType.Gemini]: [
		{ id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", tier: AiModelTier.Fast, supportsVision: true },
		{
			id: "gemini-3-flash",
			label: "Gemini 3 Flash",
			tier: AiModelTier.Balanced,
			recommended: true,
			supportsVision: true,
		},
		{ id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", tier: AiModelTier.Premium, supportsVision: true },
	],
	[ProviderType.Minimax]: [
		{ id: "MiniMax-M2.1", label: "MiniMax M2.1", tier: AiModelTier.Fast, supportsVision: false },
		{ id: "MiniMax-M2.5", label: "MiniMax M2.5", tier: AiModelTier.Balanced, recommended: true, supportsVision: true },
		{ id: "MiniMax-M2.7", label: "MiniMax M2.7", tier: AiModelTier.Premium, supportsVision: true },
	],
};

export const PROVIDER_VALUES = Object.values(ProviderType);

export function getDefaultModel(provider: ProviderType): string {
	const models = AI_MODELS[provider];
	const balanced = models.find((m) => m.recommended) ?? models.find((m) => m.tier === AiModelTier.Balanced);
	return (balanced ?? (models[0] as ModelOption)).id;
}

export function isValidProvider(value: string): value is ProviderType {
	return PROVIDER_VALUES.includes(value as ProviderType);
}

export function isValidModel(provider: ProviderType, modelId: string): boolean {
	return AI_MODELS[provider].some((m) => m.id === modelId);
}

export function modelSupportsVision(provider: ProviderType, modelId: string): boolean {
	const model = AI_MODELS[provider]?.find((m) => m.id === modelId);
	return model?.supportsVision ?? false;
}

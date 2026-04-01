import { generateStructured } from "@bonplan/ai";
import { getDefaultModel, type ProviderType } from "@bonplan/shared/ai-models";
import { z } from "zod";

const aiResponseSchema = z.object({
	keywordVariations: z.array(z.string().min(1)).min(1).max(3),
	judgmentCriteria: z.string().min(1),
	priceRange: z.object({ min: z.number().min(0), max: z.number().min(0) }).nullable(),
	confidence: z.number().min(0).max(1),
});

export type AiMapperResponse = z.infer<typeof aiResponseSchema>;

export const buildMappingPrompt = (
	query: string,
	location: string,
	radiusKm: number,
	allowBundles = false,
): { system: string; user: string } => {
	const system = `You are an expert at crafting Leboncoin.fr search queries and understanding buyer intent.

Generate 2-3 keyword variations that will find all relevant listings for the user's request.

Rules:
- Each variation is a complete search phrase used as Leboncoin's "text=" parameter
- The FIRST variation should be the most specific/precise query
- Additional variations catch listings the first might miss (abbreviations, brand names, alternate spellings, French vs English terms)
- Think about how sellers actually title their listings on a French marketplace
- Do NOT use Leboncoin categories — just text search keywords

CRITICAL — Infer the buyer's intent:
- If the query is a specific component model (e.g., "5950x", "RTX 4090"), the user wants THAT COMPONENT ALONE, not a PC/system containing it. Unless the query explicitly mentions "PC", "config", "setup", etc.
- Your judgmentCriteria MUST explicitly state what the user wants AND what should be EXCLUDED. This is critical for filtering false positives.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "keywordVariations": ["most specific search", "broader variation", "another variation"],
  "judgmentCriteria": "Write in French. MUST include: 1) What the item is (be specific: 'processeur AMD Ryzen 9 5950X'), 2) What listing types to ACCEPT (composant seul, neuf/occasion), 3) What listing types to REJECT (PC complets, bundles, systèmes contenant le composant, accessoires), 4) Expected price range for the standalone item, 5) Red flags.",
  "priceRange": { "min": 100, "max": 300 } or null if unsure,
  "confidence": 0.0 to 1.0
}

Examples:
- "5950x" → keywordVariations: ["5950x", "ryzen 9 5950x", "amd 5950x"], judgmentCriteria: "Looking for AMD Ryzen 9 5950X processor SOLD ALONE. ACCEPT: standalone CPU, CPU+cooler combo if cooler is just a bonus. REJECT: complete PCs/gaming rigs/workstations that contain a 5950X as a component, motherboard+CPU combos unless very cheap. Good deal: under 250 EUR used, under 350 EUR new. Red flags: bent pins, no photo of actual CPU."
- "iPhone 15 Pro Max 256" → keywordVariations: ["iphone 15 pro max 256", "iphone 15 pro max", "iphone 15 pro"]
- "PC gaming RTX 4090" → keywordVariations: ["PC gaming RTX 4090", "config gaming 4090", "tour gamer 4090"], judgmentCriteria: "Looking for a COMPLETE gaming PC build with RTX 4090. ACCEPT: full desktop PCs/configs with 4090. REJECT: standalone RTX 4090 GPU, laptop with 4090."
- "vélo électrique femme" → keywordVariations: ["vélo électrique femme", "velo electrique femme", "VAE femme"]`;

	const locationStr = location ? `in ${location} (within ${radiusKm} km radius)` : "in all of France (Toute la France)";
	const bundleNote = allowBundles
		? "\nNote: The user ACCEPTS bundles (e.g., CPU + motherboard combos). Include bundles as valid matches in judgmentCriteria."
		: "";
	const user = `Find: "${query}" ${locationStr}${bundleNote}`;
	return { system, user };
};

export const mapSearchToKeywords = async (
	query: string,
	location: string,
	radiusKm: number,
	apiKey: string,
	providerType: ProviderType,
	model: string | null,
	allowBundles = false,
): Promise<AiMapperResponse> => {
	const resolvedModel = model ?? getDefaultModel(providerType);
	const prompt = buildMappingPrompt(query, location, radiusKm, allowBundles);

	const { data } = await generateStructured({
		providerType,
		apiKey,
		model: resolvedModel,
		schema: aiResponseSchema,
		system: prompt.system,
		prompt: prompt.user,
		maxOutputTokens: 1024,
	});

	// Truncate keyword variations to max 3 (keep existing safety net)
	if (data.keywordVariations.length > 3) {
		data.keywordVariations = data.keywordVariations.slice(0, 3);
	}

	return data;
};

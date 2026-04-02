import { z } from "zod";

export const comparableSchema = z.object({
	title: z.string(),
	price: z.number().min(0).transform(Math.round), // EUR from AI (converted to cents in saveAnalysis)
	source: z.string(),
	date: z.string().optional(),
});

export type AiComparable = z.infer<typeof comparableSchema>;

export const analysisResultSchema = z.object({
	reasoning: z.string().min(1),
	listingType: z.enum(["STANDALONE", "SYSTEM", "BUNDLE", "ACCESSORY", "IRRELEVANT"]).default("STANDALONE"),
	matchesQuery: z.boolean(),
	score: z.number().min(0).max(100).transform(Math.round),
	verdict: z.string().min(1),
	marketPriceLow: z.number().min(0).transform(Math.round).nullable(),
	marketPriceHigh: z.number().min(0).transform(Math.round).nullable(),
	redFlags: z.array(z.string()),
	comparables: z.array(comparableSchema).default([]),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

/** Swap marketPriceLow/High if the AI returned them in the wrong order */
export const normalizeMarketPrices = <T extends { marketPriceLow: number | null; marketPriceHigh: number | null }>(
	data: T,
): T => {
	if (data.marketPriceLow !== null && data.marketPriceHigh !== null && data.marketPriceLow > data.marketPriceHigh) {
		return { ...data, marketPriceLow: data.marketPriceHigh, marketPriceHigh: data.marketPriceLow };
	}
	return data;
};

export const batchItemSchema = analysisResultSchema.extend({
	id: z.number(),
});

export type BatchAnalysisResult = z.infer<typeof batchItemSchema>;

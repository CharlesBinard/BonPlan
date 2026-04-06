import { generateStructuredWithImages } from "@bonplan/ai";
import { createLogger, listings } from "@bonplan/shared";
import type { ProviderType } from "@bonplan/shared/ai-models";
import { z } from "zod";
import { buildImageAnalysisPrompt } from "./prompts";

const logger = createLogger("analyzer");

export const IMAGE_ANALYSIS_SCORE_THRESHOLD = 60;
export const MAX_IMAGES_PER_LISTING = 10;
export const IMAGE_ANALYSIS_CONCURRENCY = 3;

export const imageAnalysisAiSchema = z.object({
	findings: z.array(z.string()),
	condition: z.string(),
	scoreAdjustment: z.number().min(-40).max(25).transform(Math.round),
});

export type ImageAnalysisResult = {
	findings: string[];
	condition: string;
	scoreAdjustment: number;
	originalScore: number;
	modelUsed: string;
};

type ListingRow = typeof listings.$inferSelect;

async function validateImageUrls(urls: string[]): Promise<string[]> {
	const valid: string[] = [];
	for (const url of urls.slice(0, MAX_IMAGES_PER_LISTING)) {
		try {
			const res = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(5000),
			});
			if (res.ok && res.headers.get("content-type")?.startsWith("image/")) {
				valid.push(url);
			}
		} catch {
			// Skip invalid URLs
		}
	}
	return valid;
}

export async function analyzeListingImages(params: {
	listing: ListingRow;
	existingAnalysis: {
		score: number;
		verdict: string;
		redFlags: string[];
		marketPriceLow: number | null;
		marketPriceHigh: number | null;
	};
	providerType: ProviderType;
	apiKey: string;
	userModel: string;
}): Promise<ImageAnalysisResult | null> {
	const { listing, existingAnalysis, providerType, apiKey, userModel } = params;

	// Skip if no images
	if (!listing.images || listing.images.length === 0) {
		return null;
	}

	// Validate image URLs
	const validUrls = await validateImageUrls(listing.images);
	if (validUrls.length === 0) {
		logger.warn("No valid image URLs", { listingId: listing.id, total: listing.images.length });
		return null;
	}

	const priceEur = (listing.price / 100).toFixed(2);
	const marketPriceLowEur = existingAnalysis.marketPriceLow !== null ? existingAnalysis.marketPriceLow / 100 : null;
	const marketPriceHighEur = existingAnalysis.marketPriceHigh !== null ? existingAnalysis.marketPriceHigh / 100 : null;

	const { system, user } = buildImageAnalysisPrompt({
		title: listing.title,
		priceEur,
		textScore: existingAnalysis.score,
		verdict: existingAnalysis.verdict,
		redFlags: existingAnalysis.redFlags,
		marketPriceLow: marketPriceLowEur,
		marketPriceHigh: marketPriceHighEur,
	});

	const { data, usage } = await generateStructuredWithImages({
		providerType,
		apiKey,
		model: userModel,
		schema: imageAnalysisAiSchema,
		system,
		prompt: user,
		imageUrls: validUrls,
		maxOutputTokens: 2048,
	});

	logger.info("Image analysis AI call", {
		listingId: listing.id,
		images: validUrls.length,
		inputTokens: usage?.inputTokens,
		outputTokens: usage?.outputTokens,
	});

	return {
		findings: data.findings,
		condition: data.condition,
		scoreAdjustment: data.scoreAdjustment,
		originalScore: existingAnalysis.score,
		modelUsed: userModel,
	};
}

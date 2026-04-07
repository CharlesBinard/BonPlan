import { AiAuthError, AiQuotaError, AiRateLimitError } from "@bonplan/ai";
import type { GeocodedLocation } from "@bonplan/shared";
import { buildKeyMap, createLogger, decrypt, publish, Stream, searches, users } from "@bonplan/shared";
import type { ProviderType } from "@bonplan/shared/ai-models";
import { eq } from "drizzle-orm";
import { mapSearchToKeywords } from "../services/ai-mapper";
import { geocodeCity } from "../services/geocoding";
import { buildLbcSearchUrls } from "../services/lbc-url-builder";
import type { ConsumerDeps } from "../types";

const logger = createLogger("orchestrator");

export const handleSearchCreated = async (deps: ConsumerDeps, searchId: string, userId: string): Promise<void> => {
	const { db, redis, config } = deps;
	const keyMap = buildKeyMap(config);

	// Get search details
	const [search] = await db.select().from(searches).where(eq(searches.id, searchId));
	if (!search) return;

	// Idempotency guard: skip re-mapping if already active with AI context (PEL retry)
	if (search.status === "active" && search.aiContext !== null) {
		logger.info("Search already mapped and active, skipping re-mapping", { searchId });
		// Just ensure it's in the scheduler
		deps.scheduler.add(searchId, userId, search.intervalMin);
		return;
	}

	// Guard: do not overwrite a blocked status with mapping
	if (search.status === "blocked") {
		logger.warn("Skipping search-created handler: search is blocked", { searchId });
		return;
	}

	// Set status to mapping
	await db.update(searches).set({ status: "mapping", updatedAt: new Date() }).where(eq(searches.id, searchId));

	// Get user's encrypted API key
	const [user] = await db
		.select({
			aiApiKeyEncrypted: users.aiApiKeyEncrypted,
			aiApiKeyVersion: users.aiApiKeyVersion,
			aiProvider: users.aiProvider,
			aiModel: users.aiModel,
		})
		.from(users)
		.where(eq(users.id, userId));

	if (!user?.aiApiKeyEncrypted) {
		logger.security("invalid_api_key_detected", { userId, searchId, reason: "no_key_configured" });
		await publish(redis, Stream.SearchError, {
			searchId,
			userId,
			source: "orchestrator",
			error: "No API key configured",
			errorType: "invalid_api_key",
		});
		return;
	}

	// Decrypt API key
	let apiKey: string;
	try {
		apiKey = decrypt(user.aiApiKeyEncrypted, keyMap);
	} catch {
		logger.security("invalid_api_key_detected", { userId, searchId, reason: "decryption_failed" });
		await publish(redis, Stream.SearchError, {
			searchId,
			userId,
			source: "orchestrator",
			error: "Failed to decrypt API key",
			errorType: "invalid_api_key",
		});
		return;
	}

	// Call AI provider for mapping
	let aiResponse: Awaited<ReturnType<typeof mapSearchToKeywords>>;
	try {
		aiResponse = await mapSearchToKeywords(
			search.query,
			search.location,
			search.radiusKm,
			apiKey,
			user.aiProvider as ProviderType,
			user.aiModel,
			search.allowBundles,
		);
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));

		if (err instanceof AiRateLimitError) {
			const retryAfter = Math.ceil((err.retryAfterMs ?? 60000) / 1000);
			logger.warn("AI rate limited during mapping", { searchId, retryAfter });
			await db
				.update(searches)
				.set({ status: "pending", lastError: error.message, updatedAt: new Date() })
				.where(eq(searches.id, searchId));
			deps.scheduler.remove(searchId);
			await publish(redis, Stream.SearchError, {
				searchId,
				userId,
				source: "orchestrator",
				error: error.message,
				errorType: "rate_limited",
			});
			return;
		}

		const isAuthError = err instanceof AiAuthError || err instanceof AiQuotaError;

		if (isAuthError) {
			logger.security("invalid_api_key_detected", {
				userId,
				searchId,
				reason: "provider_auth_error",
			});
			await publish(redis, Stream.SearchError, {
				searchId,
				userId,
				source: "orchestrator",
				error: error.message,
				errorType: err instanceof AiQuotaError ? "quota_exhausted" : "invalid_api_key",
			});
		} else {
			logger.error("AI mapping failed", { searchId, error: error.message });
			await publish(redis, Stream.SearchError, {
				searchId,
				userId,
				source: "orchestrator",
				error: error.message,
				errorType: "mapping_failed",
			});
		}

		await db
			.update(searches)
			.set({ status: "pending", lastError: error.message, updatedAt: new Date() })
			.where(eq(searches.id, searchId));
		deps.scheduler.remove(searchId);
		return;
	}

	// Use stored coordinates if available, otherwise geocode
	let geocodedLocation: GeocodedLocation | null = null;
	if (
		search.latitude != null &&
		search.longitude != null &&
		!(search.latitude === 0 && search.longitude === 0) &&
		search.latitude >= 41 &&
		search.latitude <= 52 &&
		search.longitude >= -5 &&
		search.longitude <= 10
	) {
		geocodedLocation = {
			city: search.location,
			postcode: search.postcode ?? "",
			latitude: search.latitude,
			longitude: search.longitude,
		};
		logger.info("Using stored coordinates", { searchId, lat: search.latitude, lng: search.longitude });
	} else if (search.location && search.location.trim() !== "") {
		geocodedLocation = await geocodeCity(search.location);
		if (!geocodedLocation) {
			logger.warn("Could not geocode location, falling back to France-wide search", {
				searchId,
				location: search.location,
			});
		}
	}

	// Build one search URL per keyword variation
	const searchUrls = buildLbcSearchUrls(aiResponse.keywordVariations, geocodedLocation, search.radiusKm);

	const aiContext = {
		keywordVariations: aiResponse.keywordVariations,
		judgmentCriteria: aiResponse.judgmentCriteria,
		priceRange: aiResponse.priceRange,
		confidence: aiResponse.confidence,
		searchUrls,
	};

	// Store AI context and activate
	await db
		.update(searches)
		.set({
			aiContext: aiContext as Record<string, unknown>,
			status: "active",
			updatedAt: new Date(),
		})
		.where(eq(searches.id, searchId));

	// Publish mapped event
	await publish(redis, Stream.SearchMapped, { searchId, userId, aiContext });

	// Add to scheduler
	deps.scheduler.add(searchId, userId, search.intervalMin);

	// Immediate first trigger so user doesn't wait for the interval
	deps.scheduler.triggerNow(searchId, userId).catch((triggerErr) => {
		const te = triggerErr instanceof Error ? triggerErr : new Error(String(triggerErr));
		logger.error("Immediate trigger after mapping failed", { searchId, error: te.message });
	});

	logger.info("Search mapped and scheduled", {
		searchId,
		keywords: aiContext.keywordVariations,
		confidence: aiContext.confidence,
	});
};

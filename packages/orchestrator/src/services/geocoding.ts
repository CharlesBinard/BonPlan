import { createLogger } from "@bonplan/shared";
import type { GeocodedLocation } from "@bonplan/shared";

export type { GeocodedLocation } from "@bonplan/shared";

const logger = createLogger("orchestrator");

const GEOCODING_API = "https://data.geopf.fr/geocodage/search/";

/**
 * Geocode a city name using the French government API (data.geopf.fr).
 * Returns the top match or null if not found.
 * Free, no API key needed, 50 req/s limit.
 */
export async function geocodeCity(query: string): Promise<GeocodedLocation | null> {
	try {
		const url = new URL(GEOCODING_API);
		url.searchParams.set("q", query);
		url.searchParams.set("type", "municipality");
		url.searchParams.set("limit", "1");

		const res = await fetch(url.toString(), {
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) {
			logger.warn("Geocoding API error", { status: res.status, query });
			return null;
		}

		const data = (await res.json()) as {
			features: Array<{
				geometry: { coordinates: [number, number] };
				properties: { city: string; postcode: string };
			}>;
		};

		const feature = data.features[0];
		if (!feature) {
			logger.warn("No geocoding result", { query });
			return null;
		}

		// GeoJSON coordinates are [longitude, latitude]
		const [longitude, latitude] = feature.geometry.coordinates;
		return {
			city: feature.properties.city,
			postcode: feature.properties.postcode,
			latitude,
			longitude,
		};
	} catch (err) {
		logger.warn("Geocoding failed", { query, error: err instanceof Error ? err.message : String(err) });
		return null;
	}
}

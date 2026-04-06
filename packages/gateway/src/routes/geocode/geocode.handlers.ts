import { createLogger } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthEnv } from "../../middleware/auth";
import { geocodeSearchRoute } from "./geocode.routes";

const logger = createLogger("gateway");

const GEOCODING_API = "https://data.geopf.fr/geocodage/search/";

export const geocodeRoutes = new OpenAPIHono<AuthEnv>();

geocodeRoutes.openapi(geocodeSearchRoute, async (c) => {
	const { q, limit } = c.req.valid("query");

	try {
		const url = new URL(GEOCODING_API);
		url.searchParams.set("q", q);
		url.searchParams.set("type", "municipality");
		url.searchParams.set("limit", String(limit));

		const res = await fetch(url.toString(), {
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) {
			logger.warn("Geocoding API upstream error", { status: res.status, query: q });
			return c.json({ error: "Geocoding service unavailable" }, 502);
		}

		const data = (await res.json()) as {
			features: Array<{
				geometry: { coordinates: [number, number] };
				properties: { city: string; postcode: string };
			}>;
		};

		const results = data.features.map((f) => ({
			city: f.properties.city,
			postcode: f.properties.postcode,
			latitude: f.geometry.coordinates[1],
			longitude: f.geometry.coordinates[0],
		}));

		return c.json({ results }, 200);
	} catch (err) {
		logger.warn("Geocoding proxy failed", { query: q, error: err instanceof Error ? err.message : String(err) });
		return c.json({ error: "Geocoding service unavailable" }, 502);
	}
});

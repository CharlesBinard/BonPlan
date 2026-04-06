import { createRoute, z } from "@hono/zod-openapi";

export const geocodeSearchSchema = z.object({
	q: z.string().min(2).max(200),
	limit: z.coerce.number().int().min(1).max(10).default(5),
});

const geocodeResultSchema = z.object({
	city: z.string(),
	postcode: z.string(),
	latitude: z.number(),
	longitude: z.number(),
});

export const geocodeSearchRoute = createRoute({
	method: "get",
	path: "/search",
	tags: ["Geocode"],
	request: {
		query: geocodeSearchSchema,
	},
	responses: {
		200: {
			description: "Geocoding results",
			content: {
				"application/json": {
					schema: z.object({ results: z.array(geocodeResultSchema) }),
				},
			},
		},
		502: {
			description: "Geocoding service unavailable",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
	},
});

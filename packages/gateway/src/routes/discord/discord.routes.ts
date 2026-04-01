import { createRoute, z } from "@hono/zod-openapi";
import { searchResponseSchema } from "../../schemas/shared";

export const discordUpdateSchema = z.object({
	status: z.enum(["active", "paused"]).optional(),
});

export const listDiscordSearchesRoute = createRoute({
	method: "get",
	path: "/searches",
	tags: ["Discord"],
	responses: {
		200: {
			description: "List of user searches",
			content: { "application/json": { schema: z.object({ data: z.array(searchResponseSchema) }) } },
		},
	},
});

export const updateDiscordSearchRoute = createRoute({
	method: "patch",
	path: "/searches/{id}",
	tags: ["Discord"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
		body: {
			content: { "application/json": { schema: discordUpdateSchema } },
		},
	},
	responses: {
		200: {
			description: "Search updated",
			content: { "application/json": { schema: z.object({ data: searchResponseSchema }) } },
		},
		400: {
			description: "Invalid request",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const deleteDiscordSearchRoute = createRoute({
	method: "delete",
	path: "/searches/{id}",
	tags: ["Discord"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
	},
	responses: {
		200: {
			description: "Search deleted",
			content: { "application/json": { schema: z.object({ data: z.object({ id: z.string() }) }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const triggerDiscordSearchRoute = createRoute({
	method: "post",
	path: "/searches/{id}/trigger",
	tags: ["Discord"],
	request: {
		params: z.object({ id: z.string().uuid().openapi({ description: "Search ID" }) }),
	},
	responses: {
		200: {
			description: "Scrape triggered",
			content: { "application/json": { schema: z.object({ data: z.object({ triggered: z.boolean() }) }) } },
		},
		404: {
			description: "Search not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		429: {
			description: "Rate limited",
			content: {
				"application/json": {
					schema: z.object({ error: z.string(), retryAfterSeconds: z.number() }),
				},
			},
		},
	},
});

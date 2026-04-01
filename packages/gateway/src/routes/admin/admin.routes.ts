import { createRoute, z } from "@hono/zod-openapi";

export const deadLetterEntrySchema = z
	.object({
		id: z.string(),
	})
	.catchall(z.string());

export const listDeadLettersRoute = createRoute({
	method: "get",
	path: "/dead-letters",
	tags: ["Admin"],
	responses: {
		200: {
			description: "Dead letter messages by service",
			content: {
				"application/json": { schema: z.object({ data: z.record(z.string(), z.array(deadLetterEntrySchema)) }) },
			},
		},
		403: {
			description: "Forbidden",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

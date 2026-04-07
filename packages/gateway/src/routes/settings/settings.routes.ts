import { createRoute, z } from "@hono/zod-openapi";
import { passwordSchema, validationErrorSchema } from "../../schemas/shared";

export const updateSettingsSchema = z
	.object({
		aiProvider: z.enum(["claude", "openai", "gemini", "minimax"]).optional(),
		aiModel: z.string().optional(),
		aiApiKey: z.string().trim().min(1).max(500).optional(),
		currentPassword: z.string().min(1).optional(),
		defaultWebhookUrl: z.string().url().refine((url) => url.startsWith("https://"), "HTTPS required").optional().nullable(),
		defaultMinScore: z.number().int().min(0).max(100).optional().nullable(),
		aiCustomInstructions: z.string().max(500).optional().nullable(),
	})
	.refine((d) => !d.aiApiKey || d.currentPassword, {
		message: "Password required to change API key",
		path: ["currentPassword"],
	});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: passwordSchema,
});

export const getSettingsRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Settings"],
	responses: {
		200: {
			description: "User settings",
			content: {
				"application/json": {
					schema: z.object({
						email: z.string(),
						displayName: z.string().nullable(),
						hasApiKey: z.boolean(),
						maskedApiKey: z.string().nullable(),
						aiProvider: z.string(),
						aiModel: z.string().nullable(),
						defaultWebhookUrl: z.string().nullable(),
						defaultMinScore: z.number().int().nullable(),
						aiCustomInstructions: z.string().nullable(),
					}),
				},
			},
		},
		404: {
			description: "User not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const updateSettingsRoute = createRoute({
	method: "patch",
	path: "/",
	tags: ["Settings"],
	request: {
		body: {
			content: { "application/json": { schema: updateSettingsSchema } },
		},
	},
	responses: {
		200: {
			description: "Settings updated",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
		400: {
			description: "Validation error",
			content: { "application/json": { schema: validationErrorSchema } },
		},
		401: {
			description: "Invalid password",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		404: {
			description: "User not found",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		503: {
			description: "Encryption service unavailable",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
	},
});

export const changePasswordRoute = createRoute({
	method: "patch",
	path: "/password",
	tags: ["Settings"],
	request: {
		body: {
			content: { "application/json": { schema: changePasswordSchema } },
		},
	},
	responses: {
		200: {
			description: "Password changed",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
		400: {
			description: "Failed to change password",
			content: { "application/json": { schema: validationErrorSchema } },
		},
	},
});

export const webhookTestRoute = createRoute({
	method: "post",
	path: "/webhook-test",
	tags: ["Settings"],
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({ url: z.string().url() }),
				},
			},
		},
	},
	responses: {
		200: {
			description: "Webhook test successful",
			content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
		},
		400: {
			description: "Invalid URL",
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
		},
		502: {
			description: "Webhook unreachable",
			content: { "application/json": { schema: z.object({ error: z.string(), details: z.string().optional() }) } },
		},
	},
});

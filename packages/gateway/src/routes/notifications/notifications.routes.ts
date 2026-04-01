import { createRoute, z } from "@hono/zod-openapi";
import { paginationResponseSchema, paginationSchema } from "../../schemas/shared";

export const notificationResponseSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	searchId: z.string().uuid(),
	analysisId: z.string().uuid(),
	channel: z.enum(["webhook", "discord"]),
	status: z.enum(["pending", "sent", "failed"]),
	retryCount: z.number().int(),
	payload: z.any(),
	error: z.string().nullable(),
	createdAt: z.string(),
});

export const notificationsQuerySchema = paginationSchema.extend({
	status: z.enum(["pending", "sent", "failed"]).optional(),
	channel: z.enum(["webhook", "discord"]).optional(),
});

export const listNotificationsRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Notifications"],
	request: {
		query: notificationsQuerySchema,
	},
	responses: {
		200: {
			description: "Paginated notifications",
			content: {
				"application/json": {
					schema: z.object({
						notifications: z.array(notificationResponseSchema),
						pagination: paginationResponseSchema,
					}),
				},
			},
		},
	},
});

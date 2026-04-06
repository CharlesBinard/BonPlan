import { createLogger, encrypt, users } from "@bonplan/shared";
import { isValidModel, type ProviderType } from "@bonplan/shared/ai-models";
import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { config, db } from "../../lib/db";
import type { AuthEnv } from "../../middleware/auth";
import {
	changePasswordRoute,
	getSettingsRoute,
	updateSettingsRoute,
} from "./settings.routes";

const logger = createLogger("gateway");

export const settingsRoutes = new OpenAPIHono<AuthEnv>();

// @ts-expect-error: openapi handler strict typing vs actual return types
settingsRoutes.openapi(getSettingsRoute, async (c) => {
	const userId = c.get("userId");

	const [user] = await db
		.select({
			email: users.email,
			displayName: users.displayName,
			aiApiKeyEncrypted: users.aiApiKeyEncrypted,
			aiProvider: users.aiProvider,
			aiModel: users.aiModel,
		})
		.from(users)
		.where(eq(users.id, userId));

	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	const hasApiKey = !!user.aiApiKeyEncrypted;
	// Use a static mask — we cannot safely show plaintext chars without decrypting
	const maskedApiKey: string | null = hasApiKey ? "••••••••••••" : null;

	return c.json({
		email: user.email,
		displayName: user.displayName ?? null,
		hasApiKey,
		maskedApiKey,
		aiProvider: user.aiProvider,
		aiModel: user.aiModel ?? null,
	});
});

// @ts-expect-error: openapi handler strict typing vs actual return types
settingsRoutes.openapi(updateSettingsRoute, async (c) => {
	const userId = c.get("userId");
	const { aiProvider, aiModel, aiApiKey, currentPassword } = c.req.valid("json");

	// No-op guard
	if (!aiProvider && aiModel === undefined && !aiApiKey) {
		return c.json({ success: true });
	}

	// Fetch current user state
	const [currentUser] = await db
		.select({
			email: users.email,
			aiProvider: users.aiProvider,
			aiApiKeyEncrypted: users.aiApiKeyEncrypted,
		})
		.from(users)
		.where(eq(users.id, userId));

	if (!currentUser) {
		return c.json({ error: "User not found" }, 404);
	}

	const targetProvider = aiProvider ?? currentUser.aiProvider;

	// Rule: provider change requires new API key
	if (aiProvider && aiProvider !== currentUser.aiProvider && !aiApiKey) {
		return c.json({ error: "New provider requires a new API key" }, 400);
	}

	// Rule: model must belong to target provider
	if (aiModel && !isValidModel(targetProvider as ProviderType, aiModel)) {
		return c.json({ error: "Invalid model for the selected provider" }, 400);
	}

	// Password required when changing API key
	if (aiApiKey) {
		if (!currentPassword) {
			return c.json({ error: "Password required to change API key" }, 400);
		}

		try {
			const signInResult = await auth.api.signInEmail({
				body: { email: currentUser.email, password: currentPassword },
			});
			if (!signInResult) {
				return c.json({ error: "Invalid password" }, 401);
			}
		} catch {
			return c.json({ error: "Invalid password" }, 401);
		}
	}

	// Build atomic update
	const updateData: Record<string, unknown> = { updatedAt: new Date() };

	if (aiProvider) {
		updateData.aiProvider = aiProvider;
		// Force model reset when provider changes without explicit model
		if (aiProvider !== currentUser.aiProvider && !aiModel) {
			updateData.aiModel = null;
		}
	}
	if (aiModel !== undefined) {
		updateData.aiModel = aiModel;
	}
	if (aiApiKey) {
		if (!config.encryptionKey) {
			return c.json({ error: "Encryption service unavailable" }, 503);
		}
		const encrypted = encrypt(aiApiKey, config.encryptionKey, 1);
		updateData.aiApiKeyEncrypted = encrypted;
		updateData.aiApiKeyVersion = 1;

		const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
		logger.security("api_key_updated", { userId, ip });
	}

	await db.update(users).set(updateData).where(eq(users.id, userId));

	return c.json({ success: true });
});

// @ts-expect-error: openapi handler strict typing vs actual return types
settingsRoutes.openapi(changePasswordRoute, async (c) => {
	const userId = c.get("userId");
	const body = c.req.valid("json");

	try {
		await auth.api.changePassword({
			body: {
				currentPassword: body.currentPassword,
				newPassword: body.newPassword,
				revokeOtherSessions: false,
			},
			headers: c.req.raw.headers,
		});
	} catch {
		return c.json({ error: "Failed to change password. Check your current password and try again." }, 400);
	}

	logger.security("password_changed", { userId });

	return c.json({ success: true });
});

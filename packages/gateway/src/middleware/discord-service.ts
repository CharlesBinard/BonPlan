import { createLogger, discordLinks } from "@bonplan/shared";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { config, db } from "../lib/db";

const logger = createLogger("gateway");

export type DiscordServiceEnv = {
	Variables: {
		userId: string;
	};
};

export const discordServiceAuth = createMiddleware<DiscordServiceEnv>(async (c, next) => {
	const token = c.req.header("authorization")?.replace("Bearer ", "");
	const discordUserId = c.req.header("x-discord-user-id");

	if (!token || !discordUserId) {
		return c.json({ error: "unauthorized" }, 401);
	}

	if (token !== config.discordServiceToken) {
		logger.security("discord_service_token_invalid", { discordUserId });
		return c.json({ error: "unauthorized" }, 401);
	}

	const [link] = await db
		.select({ userId: discordLinks.userId })
		.from(discordLinks)
		.where(eq(discordLinks.discordUserId, discordUserId));

	if (!link) {
		return c.json({ error: "discord_not_linked" }, 403);
	}

	c.set("userId", link.userId);
	await next();
});

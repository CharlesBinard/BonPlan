// packages/notifier/src/discord/bot.ts

import { randomBytes } from "node:crypto";
import { createLogger } from "@bonplan/shared";
import type { ChatInputCommandInteraction } from "discord.js";
import { Client, type EmbedBuilder, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import type Redis from "ioredis";

const logger = createLogger("notifier");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BotConfig = {
	token: string;
	serviceToken: string;
	gatewayUrl: string;
};

type DiscordSender = {
	sendToChannel: (channelId: string, embed: EmbedBuilder) => Promise<void>;
	sendDm: (discordUserId: string, embed: EmbedBuilder) => Promise<void>;
};

export const createDiscordBot = async (
	botConfig: BotConfig,
	redis: Redis,
): Promise<{ sender: DiscordSender; destroy: () => Promise<void> }> => {
	const client = new Client({ intents: [GatewayIntentBits.Guilds] });

	// Build commands
	const commands = [
		new SlashCommandBuilder()
			.setName("bonplan")
			.setDescription("BonPlan deal finder")
			.addSubcommand((sub) => sub.setName("link").setDescription("Link your Discord account"))
			.addSubcommand((sub) => sub.setName("list").setDescription("List your active searches"))
			.addSubcommand((sub) =>
				sub
					.setName("pause")
					.setDescription("Pause a search")
					.addStringOption((o) => o.setName("id").setDescription("Search ID").setRequired(true)),
			)
			.addSubcommand((sub) =>
				sub
					.setName("resume")
					.setDescription("Resume a search")
					.addStringOption((o) => o.setName("id").setDescription("Search ID").setRequired(true)),
			)
			.addSubcommand((sub) =>
				sub
					.setName("delete")
					.setDescription("Delete a search")
					.addStringOption((o) => o.setName("id").setDescription("Search ID").setRequired(true)),
			)
			.addSubcommand((sub) =>
				sub
					.setName("trigger")
					.setDescription("Force immediate scrape")
					.addStringOption((o) => o.setName("id").setDescription("Search ID").setRequired(true)),
			),
	];

	// Handle interactions
	client.on("interactionCreate", async (interaction) => {
		if (!interaction.isChatInputCommand() || interaction.commandName !== "bonplan") return;

		const sub = interaction.options.getSubcommand();
		const discordUserId = interaction.user.id;

		try {
			switch (sub) {
				case "link":
					await handleLink(interaction, discordUserId, redis);
					break;
				case "list":
					await handleList(interaction, discordUserId, botConfig);
					break;
				case "pause":
					await handleStatusChange(interaction, discordUserId, "paused", botConfig);
					break;
				case "resume":
					await handleStatusChange(interaction, discordUserId, "active", botConfig);
					break;
				case "delete":
					await handleDelete(interaction, discordUserId, botConfig);
					break;
				case "trigger":
					await handleTrigger(interaction, discordUserId, botConfig);
					break;
				default:
					await interaction.reply({ content: "Unknown command", ephemeral: true });
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error("Discord command failed", { sub, discordUserId, error: error.message });
			const reply = { content: "An error occurred. Please try again.", ephemeral: true };
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(reply);
			} else {
				await interaction.reply(reply);
			}
		}
	});

	// Register ready listener before login to avoid race condition
	const readyPromise = new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Discord ready timeout")), 30_000);
		client.once("ready", async () => {
			clearTimeout(timeout);
			try {
				if (!client.user) {
					throw new Error("Discord client.user unavailable after login");
				}
				const rest = new REST({ version: "10" }).setToken(botConfig.token);
				await rest.put(Routes.applicationCommands(client.user.id), {
					body: commands.map((c) => c.toJSON()),
				});
				logger.info("Discord bot ready", { username: client.user.tag });
				resolve();
			} catch (err) {
				reject(err);
			}
		});
	});

	await client.login(botConfig.token);
	await readyPromise;

	// Build sender
	const sender: DiscordSender = {
		sendToChannel: async (channelId, embed) => {
			const channel = await client.channels.fetch(channelId);
			if (channel?.isSendable()) {
				await channel.send({ embeds: [embed] });
			} else {
				throw new Error(`Channel ${channelId} not found or not text-based`);
			}
		},
		sendDm: async (discordUserId, embed) => {
			const user = await client.users.fetch(discordUserId);
			const dm = await user.createDM();
			await dm.send({ embeds: [embed] });
		},
	};

	return {
		sender,
		destroy: async () => {
			await client.destroy();
		},
	};
};

// ── Command handlers ───────────────────────────────────────────────

const callGateway = async (
	method: string,
	path: string,
	discordUserId: string,
	botConfig: BotConfig,
	body?: Record<string, unknown>,
): Promise<Response> => {
	return fetch(`${botConfig.gatewayUrl}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${botConfig.serviceToken}`,
			"X-Discord-User-Id": discordUserId,
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(10000),
	});
};

const validateSearchId = (id: string): boolean => UUID_REGEX.test(id);

// /bonplan link — generate 6-char code, store in Redis
const handleLink = async (
	interaction: ChatInputCommandInteraction,
	discordUserId: string,
	redis: Redis,
): Promise<void> => {
	// Rate limit: 3 per hour
	const rateKey = `discord-link-rate:${discordUserId}`;
	await redis.set(rateKey, 0, "EX", 3600, "NX");
	const current = await redis.incr(rateKey);
	if (current > 3) {
		await interaction.reply({ content: "Rate limited. Try again in an hour.", ephemeral: true });
		return;
	}

	// Generate crypto-safe 6-char code
	const code = randomBytes(4).toString("hex").substring(0, 6).toUpperCase();
	await redis.set(`discord-link-bot:${code}`, discordUserId, "EX", 300);

	await interaction.reply({
		content: `Your linking code: **${code}**\nGo to BonPlan Settings > Discord > "Verify Code" and enter this code.\nExpires in 5 minutes.`,
		ephemeral: true,
	});
};

// /bonplan list
const handleList = async (
	interaction: ChatInputCommandInteraction,
	discordUserId: string,
	botConfig: BotConfig,
): Promise<void> => {
	await interaction.deferReply({ ephemeral: true });
	const response = await callGateway("GET", "/api/discord/searches", discordUserId, botConfig);

	if (response.status === 403) {
		await interaction.followUp({
			content: "Your Discord account is not linked. Use `/bonplan link` first.",
			ephemeral: true,
		});
		return;
	}
	if (!response.ok) {
		await interaction.followUp({ content: "Failed to fetch searches.", ephemeral: true });
		return;
	}

	const data = (await response.json()) as { data?: Array<{ id: string; query: string; status: string }> };
	const list = data.data ?? [];

	if (list.length === 0) {
		await interaction.followUp({ content: "No searches found.", ephemeral: true });
		return;
	}

	const formatted = list.map((s) => `• \`${s.id.substring(0, 8)}\` — **${s.query}** (${s.status})`).join("\n");

	await interaction.followUp({ content: `Your searches:\n${formatted}`, ephemeral: true });
};

// /bonplan pause, /bonplan resume
const handleStatusChange = async (
	interaction: ChatInputCommandInteraction,
	discordUserId: string,
	status: "active" | "paused",
	botConfig: BotConfig,
): Promise<void> => {
	const searchId = interaction.options.getString("id", true);
	if (!validateSearchId(searchId)) {
		await interaction.reply({ content: "Invalid search ID format.", ephemeral: true });
		return;
	}

	await interaction.deferReply({ ephemeral: true });
	const response = await callGateway("PATCH", `/api/discord/searches/${searchId}`, discordUserId, botConfig, {
		status,
	});

	if (!response.ok) {
		await interaction.followUp({
			content: `Failed to ${status === "active" ? "resume" : "pause"} search.`,
			ephemeral: true,
		});
		return;
	}
	await interaction.followUp({ content: `Search ${status === "active" ? "resumed" : "paused"}.`, ephemeral: true });
};

// /bonplan delete
const handleDelete = async (
	interaction: ChatInputCommandInteraction,
	discordUserId: string,
	botConfig: BotConfig,
): Promise<void> => {
	const searchId = interaction.options.getString("id", true);
	if (!validateSearchId(searchId)) {
		await interaction.reply({ content: "Invalid search ID format.", ephemeral: true });
		return;
	}

	await interaction.deferReply({ ephemeral: true });
	const response = await callGateway("DELETE", `/api/discord/searches/${searchId}`, discordUserId, botConfig);

	if (!response.ok) {
		await interaction.followUp({ content: "Failed to delete search.", ephemeral: true });
		return;
	}
	await interaction.followUp({ content: "Search deleted.", ephemeral: true });
};

// /bonplan trigger
const handleTrigger = async (
	interaction: ChatInputCommandInteraction,
	discordUserId: string,
	botConfig: BotConfig,
): Promise<void> => {
	const searchId = interaction.options.getString("id", true);
	if (!validateSearchId(searchId)) {
		await interaction.reply({ content: "Invalid search ID format.", ephemeral: true });
		return;
	}

	await interaction.deferReply({ ephemeral: true });
	const response = await callGateway("POST", `/api/discord/searches/${searchId}/trigger`, discordUserId, botConfig);

	if (!response.ok) {
		await interaction.followUp({ content: "Failed to trigger scrape.", ephemeral: true });
		return;
	}
	await interaction.followUp({ content: "Scrape triggered.", ephemeral: true });
};

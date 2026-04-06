# Webhook UI + Discord Bot Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Discord bot and replace it with a unified webhook system where Discord webhook URLs are auto-detected and sent rich embeds. Add frontend UI for webhook configuration in Settings (global default), SearchCreateDialog, and SearchDetailPage.

**Architecture:** Two phases — Phase 1 deletes all Discord bot code and simplifies the notifier to webhook-only. Phase 2 adds the webhook UI (Settings global defaults, per-search toggle, search detail editing) and the Discord webhook auto-detection with plain-JSON embeds (no discord.js dependency).

**Tech Stack:** Hono/zod-openapi (gateway), Drizzle ORM (schema/migration), React (frontend UI), p-limit-free webhook sending

**Spec:** `docs/superpowers/specs/2026-04-06-webhook-ui-design.md`

---

## Phase 1: Discord Bot Removal

### Task 1: Remove Discord bot files and dependency

**Files:**
- Delete: `packages/notifier/src/discord/` (entire directory)
- Delete: `packages/notifier/src/__tests__/discord-embed.test.ts`
- Modify: `packages/notifier/package.json` (remove discord.js)

- [ ] **Step 1: Delete the discord directory**

```bash
rm -rf packages/notifier/src/discord/
```

- [ ] **Step 2: Delete the discord embed test**

```bash
rm packages/notifier/src/__tests__/discord-embed.test.ts
```

- [ ] **Step 3: Remove discord.js dependency**

```bash
cd packages/notifier && bun remove discord.js
```

- [ ] **Step 4: Commit**

```bash
git add -A packages/notifier/src/discord/ packages/notifier/src/__tests__/discord-embed.test.ts packages/notifier/package.json bun.lock
git commit -m "chore(notifier): remove Discord bot files and discord.js dependency"
```

---

### Task 2: Simplify notifier — remove Discord code path

**Files:**
- Modify: `packages/notifier/src/notify.ts`
- Modify: `packages/notifier/src/index.ts`

- [ ] **Step 1: Clean up notify.ts**

In `packages/notifier/src/notify.ts`:

Remove these imports:
- Line 7: `discordLinks` from `@bonplan/shared`
- Line 15: `import type { EmbedBuilder } from "discord.js";`
- Line 18: `import { buildListingEmbed } from "./discord/embed";`

Remove the `DiscordSender` type (lines 26-29).

Remove `discord` from the `NotifyDeps` type.

Remove the entire Discord notification block (lines 102-135) in `processNotification`. Keep only the webhook path.

In `sendToChannel`, remove the `"discord"` channel type — it should only handle `"webhook"`.

Add a comment to the `"webhook"` channel value:
```ts
// "discord" kept in DB enum for historical display — new notifications always use "webhook"
```

- [ ] **Step 2: Clean up index.ts**

In `packages/notifier/src/index.ts`:

Remove:
- Line 3: `import { createDiscordBot } from "./discord/bot";`
- Lines 13-27: The conditional Discord bot initialization block
- Line 33: Change `discord: discordBot?.sender ?? null` to remove the discord field entirely from the deps passed to `startNotificationConsumer`
- Line 44: `discordBot?.destroy()` in the shutdown handler

The deps object passed to `startNotificationConsumer` should no longer include `discord`.

- [ ] **Step 3: Run typecheck**

Run: `cd packages/notifier && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/notifier/src/notify.ts packages/notifier/src/index.ts
git commit -m "refactor(notifier): remove Discord code path, webhook-only notifications"
```

---

### Task 3: Remove Discord from gateway

**Files:**
- Delete: `packages/gateway/src/routes/discord/` (entire directory)
- Delete: `packages/gateway/src/middleware/discord-service.ts`
- Modify: `packages/gateway/src/app.ts`
- Modify: `packages/gateway/src/routes/settings/settings.handlers.ts`
- Modify: `packages/gateway/src/routes/settings/settings.routes.ts`

- [ ] **Step 1: Delete Discord routes and middleware**

```bash
rm -rf packages/gateway/src/routes/discord/
rm packages/gateway/src/middleware/discord-service.ts
```

- [ ] **Step 2: Clean up app.ts**

In `packages/gateway/src/app.ts`:

Remove:
- Line 6: `import { discordServiceAuth } from "./middleware/discord-service";`
- Line 11: `import { discordApiRoutes } from "./routes/discord/discord.handlers";`
- Lines 55-56: `app.use("/api/discord/*", discordServiceAuth);` and `app.route("/api/discord", discordApiRoutes);`

- [ ] **Step 3: Clean up settings handlers**

In `packages/gateway/src/routes/settings/settings.handlers.ts`:

Remove:
- Import of `discordLinks` from `@bonplan/shared`
- Import of `discordLinkRoute`, `discordVerifyRoute`, `discordUnlinkRoute` from settings.routes
- Lines 41-44: The `discordLinks` query in the GET settings handler
- Lines 57-58: `discordLinked` and `discordUserId` from the response object
- Lines 170-239: All three Discord handler functions (`discordLinkRoute`, `discordVerifyRoute`, `discordUnlinkRoute`)

- [ ] **Step 4: Clean up settings routes**

In `packages/gateway/src/routes/settings/settings.routes.ts`:

Remove:
- `discordLinkSchema` (line 21-23)
- `discordLinked` and `discordUserId` from the `getSettingsRoute` response schema (lines 42-43)
- `discordLinkRoute` definition (lines 108-126)
- `discordVerifyRoute` definition (lines 128-155)
- `discordUnlinkRoute` definition (lines 157-171)

- [ ] **Step 5: Run typecheck**

Run: `cd packages/gateway && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A packages/gateway/src/routes/discord/ packages/gateway/src/middleware/discord-service.ts packages/gateway/src/app.ts packages/gateway/src/routes/settings/
git commit -m "refactor(gateway): remove Discord routes, middleware, and settings handlers"
```

---

### Task 4: Remove Discord from shared package and DB schema

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Modify: `packages/shared/src/config.ts`
- Modify: `packages/gateway/src/routes/searches/searches.schemas.ts`
- Modify: `packages/gateway/src/schemas/shared.ts`

- [ ] **Step 1: Remove discordLinks table and search Discord columns from schema**

In `packages/shared/src/db/schema.ts`:

Remove the entire `discordLinks` table definition (lines 297-305).

Remove from the `searches` table:
- `notifyDiscord: boolean("notify_discord").notNull().default(false)` (line 110)
- `discordChannelId: text("discord_channel_id")` (line 111)

Keep `notificationChannelEnum` with both values `["webhook", "discord"]` — add a comment:
```ts
// "discord" kept for historical notification records. New notifications always use "webhook". Do not remove.
export const notificationChannelEnum = pgEnum("notification_channel", ["webhook", "discord"]);
```

- [ ] **Step 2: Remove Discord config fields**

In `packages/shared/src/config.ts`:

Remove:
- Line 11: `discordBotToken: optionalString,`
- Line 12: `discordServiceToken: optionalString,`
- Line 31: `discordBotToken: process.env.DISCORD_BOT_TOKEN || undefined,`
- Line 32: `discordServiceToken: process.env.DISCORD_SERVICE_TOKEN || undefined,`

- [ ] **Step 3: Remove Discord fields from gateway schemas**

In `packages/gateway/src/routes/searches/searches.schemas.ts`:

Remove from `createSearchSchema`:
- `notifyDiscord: z.boolean().default(false),`
- `discordChannelId: z.string().optional().nullable(),`

Remove from `updateSearchSchema`:
- `notifyDiscord: z.boolean().optional(),`
- `discordChannelId: z.string().optional().nullable(),`

In `packages/gateway/src/schemas/shared.ts`:

Remove from `searchResponseSchema`:
- `notifyDiscord: z.boolean(),`
- `discordChannelId: z.string().nullable(),`

- [ ] **Step 4: Remove Discord fields from search create handler**

In `packages/gateway/src/routes/searches/searches.handlers.ts`, remove from the `.values()` call:
- `notifyDiscord: body.notifyDiscord,`
- `discordChannelId: body.discordChannelId ?? null,`

- [ ] **Step 5: Generate Drizzle migration**

Run: `cd packages/shared && bunx drizzle-kit generate`
Expected: Migration file with DROP TABLE discord_links and ALTER TABLE searches DROP COLUMN for notifyDiscord and discordChannelId.

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: All packages PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/src/config.ts packages/shared/drizzle/ packages/gateway/src/routes/searches/ packages/gateway/src/schemas/shared.ts
git commit -m "refactor(shared): remove Discord schema, config, and gateway fields"
```

---

### Task 5: Remove Discord from frontend and infrastructure

**Files:**
- Modify: `packages/frontend/src/routes/SettingsPage.tsx`
- Modify: `packages/frontend/src/forms/schemas.ts`
- Modify: `packages/frontend/src/api/index.ts`
- Modify: `.env.example`
- Modify: `docker-compose.prod.yml`

- [ ] **Step 1: Remove Discord tab from SettingsPage**

In `packages/frontend/src/routes/SettingsPage.tsx`:

Remove:
- Imports: `useVerifyDiscordCode`, `useUnlinkDiscord` from `@/api`
- Import: `discordVerifySchema` from `@/forms/schemas`
- Import: `LinkIcon`, `UnlinkIcon` from lucide-react (if only used by Discord tab)
- The entire `DiscordTab` component (~100 lines)
- The `TabsTrigger` for "discord"
- The `TabsContent` for "discord"

- [ ] **Step 2: Remove discordVerifySchema**

In `packages/frontend/src/forms/schemas.ts`, remove lines 63-65:
```ts
export const discordVerifySchema = z.object({
    code: z.string().length(6, "Le code doit faire 6 caractères"),
});
```

- [ ] **Step 3: Remove Discord hooks from api/index.ts**

In `packages/frontend/src/api/index.ts`, remove:
- Import of `getPostApiSettingsDiscordUnlinkMutationOptions`
- Import of `getPostApiSettingsDiscordVerifyMutationOptions`
- Type alias `DiscordVerifyBody`
- `useVerifyDiscordCode` function
- `useUnlinkDiscord` function

- [ ] **Step 4: Clean up .env.example**

Remove lines 19-21 from `.env.example`:
```
# Discord (optional)
DISCORD_BOT_TOKEN=
DISCORD_SERVICE_TOKEN=
```

- [ ] **Step 5: Clean up docker-compose.prod.yml**

Remove from gateway service env:
- `DISCORD_SERVICE_TOKEN: ${DISCORD_SERVICE_TOKEN:-}`

Remove from notifier service env:
- `DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN:-}`
- `DISCORD_SERVICE_TOKEN: ${DISCORD_SERVICE_TOKEN:-}`

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (may have some errors from Orval-generated code referencing deleted Discord types — see Task 6)

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/routes/SettingsPage.tsx packages/frontend/src/forms/schemas.ts packages/frontend/src/api/index.ts .env.example docker-compose.prod.yml
git commit -m "refactor: remove Discord from frontend and infrastructure"
```

---

## Phase 2: Webhook UI + Discord Auto-Detection

### Task 6: DB — add defaultWebhookUrl and defaultMinScore to users

**Files:**
- Modify: `packages/shared/src/db/schema.ts`

- [ ] **Step 1: Add columns to users table**

In `packages/shared/src/db/schema.ts`, add to the `users` table definition after `aiModel`:

```ts
		defaultWebhookUrl: text("default_webhook_url"),
		defaultMinScore: integer("default_min_score"),
```

- [ ] **Step 2: Generate Drizzle migration**

Run: `cd packages/shared && bunx drizzle-kit generate`

- [ ] **Step 3: Run typecheck**

Run: `cd packages/shared && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle/
git commit -m "feat(db): add defaultWebhookUrl and defaultMinScore to users table"
```

---

### Task 7: Discord webhook embed builder (plain JSON, no discord.js)

**Files:**
- Create: `packages/notifier/src/webhook/discord-embed.ts`

- [ ] **Step 1: Create the discord embed builder**

Create `packages/notifier/src/webhook/discord-embed.ts`:

```ts
export type WebhookPayload = {
	title: string;
	price: number; // cents
	priceFormatted: string;
	score: number;
	verdict: string;
	url: string;
	image: string | null;
	searchQuery: string;
	marketPriceLow: number | null; // cents
	marketPriceHigh: number | null; // cents
	location: string | null;
	redFlags: string[];
};

type DiscordEmbed = {
	title: string;
	description: string;
	color: number;
	url: string;
	thumbnail?: { url: string };
	footer: { text: string };
};

const DISCORD_WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\//;

export function isDiscordWebhookUrl(url: string): boolean {
	return DISCORD_WEBHOOK_RE.test(url);
}

const getScoreColor = (score: number): number => {
	if (score >= 90) return 0x2ecc71; // green
	if (score >= 70) return 0x3498db; // blue
	if (score >= 50) return 0xf1c40f; // yellow
	if (score >= 30) return 0xe67e22; // orange
	return 0xe74c3c; // red
};

const getScoreLabel = (score: number): string => {
	if (score >= 90) return "Affaire exceptionnelle !";
	if (score >= 70) return "Bonne affaire !";
	if (score >= 50) return "Prix correct";
	if (score >= 30) return "Surpayé ou partiel";
	return "Mauvaise affaire";
};

const fmtEur = (cents: number): string => (cents / 100).toFixed(2);

export function buildDiscordWebhookPayload(input: WebhookPayload): { embeds: DiscordEmbed[] } {
	let description = `**${input.title}** — ${input.priceFormatted}\n`;

	if (input.location) {
		description += `📍 ${input.location}\n`;
	}

	if (input.marketPriceLow !== null && input.marketPriceHigh !== null) {
		description += `Prix marché: ${fmtEur(input.marketPriceLow)}-${fmtEur(input.marketPriceHigh)} EUR\n`;
	}

	description += `Recherche: ${input.searchQuery}\n\n`;
	description += `**Verdict:** ${input.verdict}\n`;

	if (input.redFlags.length > 0) {
		description += `\n⚠️ **Red flags:** ${input.redFlags.join(", ")}\n`;
	}

	const embed: DiscordEmbed = {
		title: `Score ${input.score}/100 — ${getScoreLabel(input.score)}`,
		description,
		color: getScoreColor(input.score),
		url: input.url,
		footer: { text: "BonPlan — Leboncoin Deal Finder" },
	};

	if (input.image) {
		embed.thumbnail = { url: input.image };
	}

	return { embeds: [embed] };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/notifier && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/notifier/src/webhook/discord-embed.ts
git commit -m "feat(notifier): add Discord webhook embed builder (plain JSON, no discord.js)"
```

---

### Task 8: Update sendWebhook to auto-detect Discord and use extended payload

**Files:**
- Modify: `packages/notifier/src/webhook/webhook.ts`
- Modify: `packages/notifier/src/notify.ts`

- [ ] **Step 1: Update WebhookPayload type and sendWebhook function**

In `packages/notifier/src/webhook/webhook.ts`:

Replace the `WebhookPayload` type with the extended version (add `location` and `redFlags`):

```ts
export type WebhookPayload = {
	title: string;
	price: number;
	priceFormatted: string;
	score: number;
	verdict: string;
	url: string;
	image: string | null;
	searchQuery: string;
	marketPriceLow: number | null;
	marketPriceHigh: number | null;
	location: string | null;
	redFlags: string[];
};
```

Update the `sendWebhook` function to auto-detect Discord URLs:

```ts
import { buildDiscordWebhookPayload, isDiscordWebhookUrl } from "./discord-embed";

// In the sendWebhook function, before the fetch call:
const body = isDiscordWebhookUrl(webhookUrl)
    ? buildDiscordWebhookPayload(payload)
    : payload;

// Use JSON.stringify(body) instead of JSON.stringify(payload)
```

- [ ] **Step 2: Update notify.ts to pass location and redFlags**

In `packages/notifier/src/notify.ts`, update the webhook payload construction to include `location` and `redFlags`:

```ts
const payload: WebhookPayload = {
    title: listing.title,
    price: listing.price,
    priceFormatted: `${(listing.price / 100).toFixed(2)} EUR`,
    score,
    verdict,
    url: listing.url,
    image: listing.images?.[0] ?? null,
    searchQuery: search.query,
    marketPriceLow: analysis?.marketPriceLow ?? null,
    marketPriceHigh: analysis?.marketPriceHigh ?? null,
    location: listing.location ?? null,
    redFlags: analysis?.redFlags ?? [],
};
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/notifier && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/notifier/src/webhook/webhook.ts packages/notifier/src/notify.ts
git commit -m "feat(notifier): auto-detect Discord webhook URLs and send rich embeds"
```

---

### Task 9: Gateway — settings endpoints for webhook defaults

**Files:**
- Modify: `packages/gateway/src/routes/settings/settings.routes.ts`
- Modify: `packages/gateway/src/routes/settings/settings.handlers.ts`

- [ ] **Step 1: Update settings response schema**

In `packages/gateway/src/routes/settings/settings.routes.ts`, add to the `getSettingsRoute` response schema:

```ts
	defaultWebhookUrl: z.string().nullable(),
	defaultMinScore: z.number().int().nullable(),
```

- [ ] **Step 2: Update settings update schema**

Add to `updateSettingsSchema` (or create if it doesn't exist):

```ts
	defaultWebhookUrl: z.string().url().refine((url) => url.startsWith("https://"), "HTTPS required").optional().nullable(),
	defaultMinScore: z.number().int().min(0).max(100).optional().nullable(),
```

- [ ] **Step 3: Add webhook-test route definition**

Add a new route definition:

```ts
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
```

- [ ] **Step 4: Update GET settings handler**

In `packages/gateway/src/routes/settings/settings.handlers.ts`, add `defaultWebhookUrl` and `defaultMinScore` to the user select query and the response object.

- [ ] **Step 5: Update PATCH settings handler**

Add handling for `defaultWebhookUrl` and `defaultMinScore` in the update handler.

- [ ] **Step 6: Implement webhook-test handler**

```ts
settingsRoutes.openapi(webhookTestRoute, async (c) => {
	const { url } = c.req.valid("json");

	// SSRF validation
	const { validateWebhookUrl, validateWebhookIp } = await import("../../lib/ssrf");
	const urlCheck = validateWebhookUrl(url, process.env.NODE_ENV !== "production");
	if (!urlCheck.valid) {
		return c.json({ error: urlCheck.reason ?? "URL invalide" }, 400);
	}

	const ipCheck = await validateWebhookIp(new URL(url).hostname);
	if (!ipCheck.valid) {
		return c.json({ error: ipCheck.reason ?? "URL invalide" }, 400);
	}

	// Import discord detection
	const { isDiscordWebhookUrl, buildDiscordWebhookPayload } = await import("@bonplan/notifier/webhook/discord-embed");

	const testPayload = {
		title: "Test BonPlan Webhook",
		price: 29900,
		priceFormatted: "299.00 EUR",
		score: 85,
		verdict: "• Ceci est un test\n• Webhook configuré avec succès",
		url: "https://www.leboncoin.fr/test",
		image: null,
		searchQuery: "test",
		marketPriceLow: 27000,
		marketPriceHigh: 32000,
		location: "Paris",
		redFlags: [],
	};

	const body = isDiscordWebhookUrl(url)
		? buildDiscordWebhookPayload(testPayload)
		: testPayload;

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10000),
		});

		if (!res.ok) {
			return c.json({ error: "Webhook injoignable", details: `HTTP ${res.status}` }, 502);
		}

		return c.json({ success: true }, 200);
	} catch (err) {
		return c.json({
			error: "Webhook injoignable",
			details: err instanceof Error ? err.message : String(err),
		}, 502);
	}
});
```

Note: The SSRF validation functions may need to be imported from the notifier package or copied. Check if they're accessible from the gateway. If not, move the SSRF validation to `@bonplan/shared` or use a dynamic import path. Adapt as needed during implementation.

- [ ] **Step 7: Run typecheck**

Run: `cd packages/gateway && bun run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/gateway/src/routes/settings/
git commit -m "feat(gateway): add webhook default settings and webhook-test endpoint"
```

---

### Task 10: Frontend — Settings "Notifications" tab

**Files:**
- Modify: `packages/frontend/src/routes/SettingsPage.tsx`

- [ ] **Step 1: Replace WebhooksTab stub with functional NotificationsTab**

Replace the static `WebhooksTab` component with a functional `NotificationsTab`:

```tsx
const NotificationsTab = () => {
	const { data: settings } = useSettings();
	const updateSettings = useUpdateSettings();
	const [webhookUrl, setWebhookUrl] = useState(settings?.data?.defaultWebhookUrl ?? "");
	const [minScore, setMinScore] = useState(String(settings?.data?.defaultMinScore ?? 70));
	const [testing, setTesting] = useState(false);

	// Sync from server data
	useEffect(() => {
		if (settings?.data) {
			setWebhookUrl(settings.data.defaultWebhookUrl ?? "");
			setMinScore(String(settings.data.defaultMinScore ?? 70));
		}
	}, [settings?.data]);

	const handleSave = async () => {
		await updateSettings.mutateAsync({
			data: {
				defaultWebhookUrl: webhookUrl || null,
				defaultMinScore: Number(minScore) || null,
			},
		});
	};

	const handleTest = async () => {
		if (!webhookUrl) return;
		setTesting(true);
		try {
			await api("/api/settings/webhook-test", { method: "POST", body: { url: webhookUrl } });
			toast.success("Test réussi ! Vérifiez la réception.");
		} catch (err) {
			toast.error(err instanceof ApiError ? err.data.error as string : "Erreur lors du test");
		} finally {
			setTesting(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications Webhook</CardTitle>
				<CardDescription>URL par défaut pour les nouvelles recherches. Compatible Discord webhook.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<FormField label="URL Webhook" htmlFor="defaultWebhookUrl"
					helpText="Discord webhook (discord.com/api/webhooks/...) ou URL custom HTTPS">
					<div className="flex gap-2">
						<Input id="defaultWebhookUrl" placeholder="https://discord.com/api/webhooks/..."
							value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="flex-1" />
						<Button variant="outline" size="sm" onClick={handleTest}
							disabled={!webhookUrl || testing}>
							{testing ? <Loader2Icon className="animate-spin size-4" /> : "Tester"}
						</Button>
					</div>
				</FormField>
				<FormField label="Score minimum par défaut" htmlFor="defaultMinScore"
					helpText="Seuil de notification (0-100)">
					<Input id="defaultMinScore" type="number" min={0} max={100}
						value={minScore} onChange={(e) => setMinScore(e.target.value)} />
				</FormField>
				<Button onClick={handleSave} disabled={updateSettings.isPending}>
					{updateSettings.isPending ? <Loader2Icon className="animate-spin" /> : null}
					Sauvegarder
				</Button>
			</CardContent>
		</Card>
	);
};
```

Update the tab trigger from "Webhooks" to "Notifications" and wire `NotificationsTab`.

- [ ] **Step 2: Run typecheck**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS (may need Orval regen first)

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/routes/SettingsPage.tsx
git commit -m "feat(frontend): replace webhook stub with functional Notifications tab in Settings"
```

---

### Task 11: Frontend — webhook toggle in SearchCreateDialog

**Files:**
- Modify: `packages/frontend/src/routes/SearchesPage.tsx`
- Modify: `packages/frontend/src/forms/schemas.ts`

- [ ] **Step 1: Update frontend schema**

In `packages/frontend/src/forms/schemas.ts`, add to `searchCreateSchema` (after `analyzeImages`):

```ts
	notifyWebhook: z.string().url().refine((url) => url.startsWith("https://"), "L'URL doit utiliser HTTPS").optional().nullable(),
```

- [ ] **Step 2: Add webhook state and UI to SearchCreateDialog**

In `packages/frontend/src/routes/SearchesPage.tsx`, in `SearchCreateDialog`:

Add state:
```ts
const [enableWebhook, setEnableWebhook] = useState(false);
const [webhookUrl, setWebhookUrl] = useState("");
```

Fetch user settings to get defaults:
```ts
const { data: settings } = useSettings();
```

Pre-fill when toggle is enabled:
```ts
useEffect(() => {
    if (enableWebhook && !webhookUrl && settings?.data?.defaultWebhookUrl) {
        setWebhookUrl(settings.data.defaultWebhookUrl);
    }
}, [enableWebhook]);
```

Default `enableWebhook` to `true` when global URL exists:
```ts
useEffect(() => {
    if (settings?.data?.defaultWebhookUrl) {
        setEnableWebhook(true);
        setWebhookUrl(settings.data.defaultWebhookUrl);
    }
}, [settings?.data?.defaultWebhookUrl]);
```

Pre-fill minScore from defaultMinScore:
```ts
const [minScore, setMinScore] = useState(
    String(settings?.data?.defaultMinScore ?? 70)
);
```

Add to `reset()`:
```ts
setEnableWebhook(!!settings?.data?.defaultWebhookUrl);
setWebhookUrl(settings?.data?.defaultWebhookUrl ?? "");
```

Add to `onSubmit` safeParse:
```ts
notifyWebhook: enableWebhook ? webhookUrl : null,
```

Add the toggle UI after the "Analyser les images" toggle:
```tsx
<div className="flex items-center gap-3">
    <Switch id="enableWebhook" checked={enableWebhook}
        onCheckedChange={(checked) => setEnableWebhook(checked)} />
    <Label htmlFor="enableWebhook" className="cursor-pointer">
        Notifications webhook
    </Label>
</div>

{enableWebhook && (
    <FormField label="URL Webhook" htmlFor="webhookUrl"
        helpText={webhookUrl ? undefined : "Configurez une URL par défaut dans Paramètres > Notifications, ou saisissez une URL ci-dessous."}>
        <Input id="webhookUrl" placeholder="https://discord.com/api/webhooks/..."
            value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
    </FormField>
)}
```

Add webhook to the preview section:
```tsx
<div className="flex items-center gap-2">
    <span className="text-muted-foreground">Webhook :</span>
    <span className="font-medium truncate max-w-48">
        {enableWebhook && webhookUrl ? webhookUrl : "Désactivé"}
    </span>
</div>
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/SearchesPage.tsx packages/frontend/src/forms/schemas.ts
git commit -m "feat(frontend): add webhook toggle with URL field to SearchCreateDialog"
```

---

### Task 12: Frontend — webhook editing in SearchDetailPage

**Files:**
- Modify: `packages/frontend/src/routes/SearchDetailPage.tsx`

- [ ] **Step 1: Add webhook notification section**

Add a "Notifications" card/section to the SearchDetailPage showing the current webhook URL and a "Modifier" button that opens a dialog to edit it:

```tsx
{/* Notifications section */}
<div className="flex flex-col gap-2">
    <h2 className="text-sm font-medium text-muted-foreground">Notifications</h2>
    <div className="flex items-center gap-2">
        <span className="text-sm truncate max-w-64">
            {search.notifyWebhook ?? "Aucun webhook configuré"}
        </span>
        <Button variant="outline" size="sm" onClick={() => setWebhookDialogOpen(true)}>
            Modifier
        </Button>
    </div>
</div>
```

Add a dialog for editing:
```tsx
<Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Modifier les notifications</DialogTitle>
        </DialogHeader>
        <FormField label="URL Webhook" htmlFor="editWebhookUrl">
            <Input id="editWebhookUrl" value={editWebhookUrl}
                onChange={(e) => setEditWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..." />
        </FormField>
        <DialogFooter>
            <Button onClick={async () => {
                await updateSearch.mutateAsync({
                    id: search.id,
                    data: { notifyWebhook: editWebhookUrl || null },
                });
                setWebhookDialogOpen(false);
            }}>
                Sauvegarder
            </Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
```

Add the required state:
```ts
const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
const [editWebhookUrl, setEditWebhookUrl] = useState(search?.notifyWebhook ?? "");
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/routes/SearchDetailPage.tsx
git commit -m "feat(frontend): add webhook editing dialog to SearchDetailPage"
```

---

### Task 13: Apply migrations, regenerate Orval, manual test

- [ ] **Step 1: Apply migrations**

Run: `cd packages/shared && bunx drizzle-kit push`
Expected: Migrations applied (drop discord_links, drop notifyDiscord/discordChannelId from searches, add defaultWebhookUrl/defaultMinScore to users)

- [ ] **Step 2: Record migration in journal**

Same pattern as previous migrations — insert the migration hash into `drizzle.__drizzle_migrations`.

- [ ] **Step 3: Start gateway and regenerate Orval**

```bash
# Start gateway temporarily
cd packages/gateway && set -a && source ../../.env && set +a && NODE_ENV=development bun run src/index.ts &
sleep 4
cd packages/frontend && bun run orval
# Kill gateway
pkill -f "bun run src/index.ts"
```

- [ ] **Step 4: Run full typecheck**

Run: `bun run typecheck`
Expected: All packages PASS

- [ ] **Step 5: Commit Orval output**

```bash
git add packages/frontend/src/api/generated/
git commit -m "chore(frontend): regenerate Orval API client after Discord removal + webhook changes"
```

- [ ] **Step 6: Manual test — Settings page**

1. Go to Settings > Notifications
2. Enter a webhook URL (e.g., a webhook.site URL)
3. Click "Tester" — verify success toast and webhook received
4. Set a default min score (e.g., 75)
5. Save

- [ ] **Step 7: Manual test — Search creation with webhook**

1. Create a new search
2. Verify the webhook toggle is ON and URL is pre-filled from Settings
3. Verify minScore is pre-filled from Settings
4. Submit the search
5. Wait for listings + analysis
6. Verify webhook is received at the URL

- [ ] **Step 8: Manual test — Discord webhook**

1. Create a Discord webhook in a test channel
2. Set it as the URL in a search
3. Wait for a listing with score >= minScore
4. Verify a rich embed appears in the Discord channel

- [ ] **Step 9: Manual test — SearchDetailPage editing**

1. Go to a search detail page
2. Click "Modifier" in the Notifications section
3. Change the webhook URL
4. Save and verify the change persists

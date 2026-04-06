# Webhook UI + Discord Bot Removal — Design Spec

**Date**: 2026-04-06
**Status**: Approved (rev.2 — post 5-agent review)

## Overview

Supprimer le bot Discord (trop complexe pour l'utilisateur) et le remplacer par un systeme de webhook unifie. L'utilisateur colle une URL (webhook classique ou Discord webhook) et le backend detecte automatiquement le format a utiliser. Ajout de l'UI frontend pour configurer les webhooks (Settings global + par recherche + page detail).

## Scope

### A supprimer

**Notifier package :**

- `packages/notifier/src/discord/` — tout le dossier (bot.ts, embed.ts, sender.ts)
- `packages/notifier/src/index.ts` — supprimer le code d'initialisation/teardown du bot Discord
- `packages/notifier/src/notify.ts` — supprimer tout le chemin Discord (imports, type DiscordSender, path `"discord"` dans sendToChannel, lookup `discord_links`)
- `packages/notifier/src/__tests__/discord-embed.test.ts` — supprimer (ou migrer vers le nouveau format embed)
- `packages/notifier/package.json` — supprimer la dependance `discord.js`, puis `bun install` pour mettre a jour le lockfile

**Gateway package :**

- `packages/gateway/src/routes/discord/` — tout le dossier (discord.handlers.ts, discord.routes.ts)
- `packages/gateway/src/middleware/discord-service.ts` — supprimer
- `packages/gateway/src/app.ts` — supprimer l'import/usage de `discordServiceAuth` et le montage de la route `/api/discord`
- `packages/gateway/src/routes/settings/settings.handlers.ts` — supprimer les handlers `discordLinkRoute`, `discordVerifyRoute`, `discordUnlinkRoute` + supprimer `discordLinked`/`discordUserId` de la reponse GET settings
- `packages/gateway/src/routes/settings/settings.routes.ts` — supprimer les definitions de routes Discord + supprimer `discordLinked`/`discordUserId` du schema de reponse settings

**Shared package :**

- `packages/shared/src/db/schema.ts` — supprimer la definition de la table `discord_links`, supprimer les colonnes `notifyDiscord` et `discordChannelId` de la table `searches`
- `packages/shared/src/config.ts` — supprimer les champs `discordBotToken` et `discordServiceToken`

**Frontend :**

- `packages/frontend/src/routes/SettingsPage.tsx` — supprimer l'onglet Discord (composant DiscordTab, UI de linking, verification du code)
- `packages/frontend/src/forms/schemas.ts` — supprimer `discordVerifySchema`
- `packages/frontend/src/api/index.ts` — supprimer les hooks `useVerifyDiscordCode`, `useUnlinkDiscord`

**Infrastructure :**

- `.env.example` — supprimer `DISCORD_BOT_TOKEN` et `DISCORD_SERVICE_TOKEN`
- `docker-compose.prod.yml` — supprimer les variables d'env Discord des services gateway et notifier

### A garder

- L'enum `notificationChannelEnum` — garder `"discord"` ET `"webhook"` dans le schema DB, les schemas Zod, et les types TypeScript. Les anciennes notifications Discord restent visibles dans l'historique. **Ajouter un commentaire dans le code** expliquant pourquoi `"discord"` est conserve :
  ```ts
  // "discord" kept for historical display — old notifications used this channel.
  // New notifications always use "webhook". Do not remove.
  ```

### A creer

- Auto-detection Discord webhook dans le notifier
- UI webhook dans Settings, SearchCreateDialog, SearchDetailPage
- Colonnes `defaultWebhookUrl` et `defaultMinScore` sur la table `users`
- Endpoint `POST /api/settings/webhook-test`
- Fonction `buildDiscordWebhookPayload()` — nouvelle fonction (voir section dediee)

## Backend — Notifier

### `buildDiscordWebhookPayload()` — NOUVELLE fonction, pas un deplacement

**Important** : `buildDiscordWebhookPayload()` est une NOUVELLE fonction qui construit des objets JSON bruts conformes a l'API embed Discord. Elle n'utilise PAS `discord.js` `EmbedBuilder` — la dependance `discord.js` est supprimee entierement.

Fichier : `packages/notifier/src/webhook/discord-embed.ts`

```ts
interface WebhookPayload {
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
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number; // decimal color value
  url: string;
  thumbnail: { url: string } | undefined;
  footer: { text: string };
}

function buildDiscordWebhookPayload(input: WebhookPayload): { embeds: DiscordEmbed[] }
```

La fonction construit un objet plain JSON :

```ts
{
  embeds: [{
    title: string,
    description: string,    // score, verdict, prix, location, redFlags
    color: number,           // decimal — vert/orange/rouge selon score
    url: string,
    thumbnail: { url: string } | undefined,
    footer: { text: string }
  }]
}
```

Le champ `description` inclut : score colore, prix, verdict, location (si disponible), et red flags (si presentes).

### Type `WebhookPayload` — inclut `location` + `redFlags`

Le type `WebhookPayload` (utilise en interne par le notifier) inclut `location` et `redFlags` pour que le builder Discord embed ait toutes les donnees necessaires :

```ts
interface WebhookPayload {
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
  location: string | null;   // <-- necessaire pour l'embed Discord
  redFlags: string[];         // <-- necessaire pour l'embed Discord
}
```

Le payload JSON classique (non-Discord) envoie egalement ces champs — pas de raison de les exclure.

### Detection des URLs Discord webhook

Regex de detection (incluant les sous-domaines canary et ptb) :

```ts
const DISCORD_WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\//;

function isDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url);
}
```

URLs matchees :
- `https://discord.com/api/webhooks/...`
- `https://discordapp.com/api/webhooks/...`
- `https://canary.discord.com/api/webhooks/...`
- `https://ptb.discord.com/api/webhooks/...`
- `https://canary.discordapp.com/api/webhooks/...`
- `https://ptb.discordapp.com/api/webhooks/...`

### `sendWebhook` — gere les deux formats

La fonction `sendWebhook` accepte le payload interne complet (avec `location` + `redFlags`), detecte l'URL Discord en interne, et adapte le format :

```ts
async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const body = isDiscordWebhookUrl(url)
    ? buildDiscordWebhookPayload(payload)  // { embeds: [...] }
    : payload;                              // JSON classique

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

### Webhook unifie avec auto-detection Discord

Dans `packages/notifier/src/notify.ts`, le flow de notification simplifie :

1. Receive `ListingAnalyzed` event
2. Fetch search config → check `notifyWebhook` est non-null
3. Check `score >= search.minScore`
4. Fetch listing + analysis data (inclure location + redFlags)
5. Appeler `sendWebhook(url, payload)` — la detection Discord et l'adaptation du format sont internes a cette fonction
6. Meme SSRF protection, retry, idempotency

### Simplification de `notify.ts`

Supprimer tout le chemin Discord (sendToChannel discord, lookup discord_links, imports Discord, type DiscordSender). Le consumer ne gere plus qu'un seul canal : `"webhook"`.

La table `notifications` garde `channel: notificationChannelEnum` mais la valeur sera toujours `"webhook"` pour les nouvelles notifications.

## Backend — Base de donnees

### Table `users` — 2 nouvelles colonnes

- `defaultWebhookUrl` : `text`, nullable
- `defaultMinScore` : `integer`, nullable — si null, le frontend pre-remplit 70 par defaut

### Table `discord_links` — supprimer

Migration : `DROP TABLE discord_links`

### Table `searches` — supprimer 2 colonnes

- Supprimer `notifyDiscord` (`boolean`)
- Supprimer `discordChannelId` (`text`)

Migration Drizzle a generer.

## Backend — Gateway

### Suppression des routes Discord

- Supprimer `packages/gateway/src/routes/discord/` (tout le dossier)
- Supprimer `packages/gateway/src/middleware/discord-service.ts`
- Supprimer dans `app.ts` : l'import de `discordServiceAuth`, l'usage `app.use("/api/discord/*", discordServiceAuth)`, et le montage `app.route("/api/discord", discordApiRoutes)`

### Adaptation des schemas

**`createSearchSchema`** : supprimer `notifyDiscord` et `discordChannelId`
**`updateSearchSchema`** : supprimer `notifyDiscord` et `discordChannelId`
**`searchResponseSchema`** : supprimer `notifyDiscord` et `discordChannelId`

### Settings endpoints

**`GET /api/settings`** :
- Ajouter `defaultWebhookUrl` et `defaultMinScore` dans la reponse
- Supprimer `discordLinked` et `discordUserId` de la reponse

**`PATCH /api/settings`** : accepter `defaultWebhookUrl` (string URL HTTPS, optional, nullable) et `defaultMinScore` (number 0-100, optional, nullable)

**Nouveau endpoint `POST /api/settings/webhook-test`** :

```ts
// Request body
{ url: string } // URL a tester

// Response 200
{ success: true }

// Response 400
{ error: "URL invalide" }

// Response 502
{ error: "Webhook injoignable", details: string }
```

- Valide l'URL (SSRF check)
- Auto-detecte si l'URL est un webhook Discord via `isDiscordWebhookUrl()`
- **Discord** : envoie un embed test via `buildDiscordWebhookPayload()` avec des donnees de test
- **Autre** : envoie un POST avec un payload test JSON :
  ```json
  {
    "test": true,
    "title": "Test BonPlan Webhook",
    "price": 29900,
    "priceFormatted": "299.00 EUR",
    "score": 85,
    "verdict": "Ceci est un test\nWebhook configure avec succes",
    "url": "https://www.leboncoin.fr/test",
    "image": null,
    "searchQuery": "test",
    "marketPriceLow": 27000,
    "marketPriceHigh": 32000,
    "location": "Paris 75001",
    "redFlags": []
  }
  ```
- Retourne success/error

### Regeneration du client Orval

Apres toutes les modifications de schemas gateway, regenerer le client Orval :

```bash
bun run generate  # ou la commande Orval configuree dans le projet
```

Cela met a jour les types TypeScript et hooks frontend generes automatiquement.

## Frontend — Settings

### Onglet "Notifications" (remplace "Webhooks" stub + "Discord")

Supprimer l'onglet "Discord" et remplacer le stub "Webhooks" par un onglet fonctionnel "Notifications" :

- **Champ URL webhook** : input texte, placeholder "https://discord.com/api/webhooks/... ou https://votre-api.com/webhook"
- **Champ score minimum par defaut** : input number 0-100, defaut 70
- **Bouton "Tester"** : envoie un POST a `/api/settings/webhook-test` avec l'URL saisie, affiche success/error avec un toast
- **Bouton "Sauvegarder"** : PATCH `/api/settings`
- **Note explicative** : "Cette URL sera utilisee par defaut pour les nouvelles recherches. Vous pouvez la modifier par recherche."

### Suppression de l'onglet Discord

Supprimer le composant `DiscordTab` et tout le code de linking Discord (code 6 chars, verification).

### Suppression des hooks et schemas Discord

- Supprimer `useVerifyDiscordCode` et `useUnlinkDiscord` de `packages/frontend/src/api/index.ts`
- Supprimer `discordVerifySchema` de `packages/frontend/src/forms/schemas.ts`

## Frontend — SearchCreateDialog

Apres le toggle "Analyser les images (IA)", ajouter :

```tsx
<div className="flex items-center gap-3">
  <Switch id="enableWebhook" checked={enableWebhook} onCheckedChange={setEnableWebhook} />
  <Label htmlFor="enableWebhook" className="cursor-pointer">
    Notifications webhook
  </Label>
</div>

{enableWebhook && (
  <FormField
    label="URL Webhook"
    htmlFor="webhookUrl"
    helpText={
      !webhookUrl && !user?.defaultWebhookUrl
        ? "Configurez une URL par defaut dans Parametres > Notifications, ou saisissez une URL ci-dessous."
        : "Discord webhook ou URL custom"
    }
  >
    <Input
      id="webhookUrl"
      placeholder="https://discord.com/api/webhooks/..."
      value={webhookUrl}
      onChange={(e) => setWebhookUrl(e.target.value)}
    />
  </FormField>
)}
```

### Etat initial du toggle

- **Si `user.defaultWebhookUrl` existe** : `enableWebhook` default a `true` (pre-opted-in)
- **Si pas de `defaultWebhookUrl`** : `enableWebhook` default a `false`

### Pre-remplissage

Quand le toggle est active :
- Pre-remplir `webhookUrl` depuis `user.defaultWebhookUrl` (si disponible)
- Pre-remplir `minScore` depuis `user.defaultMinScore ?? 70`

**Important** : le backend ne fait aucune logique de `defaultMinScore` — il recoit `minScore` dans le body de la requete tel quel. C'est le frontend qui est responsable du pre-remplissage.

Meme logique pour `webhookUrl` : le frontend pre-remplit depuis `user.defaultWebhookUrl`.

### No-URL hint

Quand le toggle est active mais qu'il n'y a aucune URL (ni globale, ni saisie), afficher le helpText : "Configurez une URL par defaut dans Parametres > Notifications, ou saisissez une URL ci-dessous."

### Validation frontend de l'URL

Ajouter dans les schemas frontend :

```ts
notifyWebhook: z.string()
  .url()
  .refine(url => url.startsWith("https://"), "L'URL doit utiliser HTTPS")
  .optional()
  .nullable()
```

### onSubmit

Si `enableWebhook` est true, envoyer `notifyWebhook: webhookUrl`. Sinon, `notifyWebhook: null`.

### Apercu

Ajouter une ligne "Webhook : https://disc... (tronque)" ou "Desactive".

### Schema frontend

`searchCreateSchema` : supprimer les references a `notifyDiscord` et `discordChannelId` si elles existent cote frontend.

## Frontend — SearchDetailPage

Ajouter une section "Notifications" :

- Afficher l'URL webhook actuelle ou "Aucun webhook configure"
- Afficher le `minScore` actuel de la recherche
- **Bouton "Modifier les notifications"** qui ouvre un **dialog** (coherent avec le pattern d'edition par dialog de l'app) — pas d'edition inline
- Le dialog contient : champ URL webhook, champ minScore, validation, sauvegarde via `PATCH /api/searches/:id` (updateSearch accepte deja `notifyWebhook`)

## Ce qui ne change PAS

- Le payload JSON webhook classique (format inchange, avec les champs `location` et `redFlags` en plus)
- La table `notifications` (historique conserve, anciennes notifs Discord restent visibles)
- L'enum `notificationChannelEnum` — garder `"webhook"` ET `"discord"` pour l'historique. Ajouter un commentaire dans le code expliquant pourquoi `"discord"` est conserve
- La page Notifications (affiche toujours l'historique des envois)
- Le SSRF check existant
- La retry/idempotency logic

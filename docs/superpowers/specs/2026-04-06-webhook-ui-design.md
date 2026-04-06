# Webhook UI + Discord Bot Removal — Design Spec

**Date**: 2026-04-06
**Status**: Approved

## Overview

Supprimer le bot Discord (trop complexe pour l'utilisateur) et le remplacer par un système de webhook unifié. L'utilisateur colle une URL (webhook classique ou Discord webhook) et le backend détecte automatiquement le format à utiliser. Ajout de l'UI frontend pour configurer les webhooks (Settings global + par recherche + page détail).

## Scope

### À supprimer

- `packages/notifier/src/discord/` — tout le dossier (bot.ts, embed.ts, sender.ts)
- `packages/gateway/src/routes/discord/` — routes API Discord (handlers + routes)
- Table `discord_links` — supprimer la table
- Colonnes `notifyDiscord` et `discordChannelId` sur la table `searches`
- Middleware `discordServiceAuth` et son montage dans `app.ts`
- UI Settings onglet "Discord" (linking, code 6 chars)
- Schemas gateway : champs Discord dans `createSearchSchema`, `updateSearchSchema`, `searchResponseSchema`

### À garder

- `buildListingEmbed()` — déplacer de `discord/embed.ts` vers `packages/notifier/src/webhook/discord-embed.ts` pour réutiliser le format embed quand l'URL est un webhook Discord

### À ajouter

- Auto-détection Discord webhook dans le notifier
- UI webhook dans Settings, SearchCreateDialog, SearchDetailPage
- Colonnes `defaultWebhookUrl` et `defaultMinScore` sur la table `users`
- Endpoint `POST /api/settings/webhook-test`

## Backend — Notifier

### Webhook unifié avec auto-détection Discord

Dans `packages/notifier/src/notify.ts`, le flow de notification simplifié :

1. Receive `ListingAnalyzed` event
2. Fetch search config → check `notifyWebhook` est non-null
3. Check `score >= search.minScore`
4. Fetch listing + analysis data
5. Détecter si l'URL match `https://discord.com/api/webhooks/` ou `https://discordapp.com/api/webhooks/`
   - **Discord** : construire un embed via `buildDiscordWebhookPayload()` et POST `{ embeds: [embed] }`
   - **Autre** : POST le JSON classique (payload existant inchangé)
6. Même SSRF protection, retry, idempotency

### Nouveau fichier `packages/notifier/src/webhook/discord-embed.ts`

Déplacer `buildListingEmbed()` depuis `packages/notifier/src/discord/embed.ts`. Adapter pour produire un payload compatible Discord webhook API :

```ts
function buildDiscordWebhookPayload(input: EmbedInput): { embeds: DiscordEmbed[] }
```

Le format embed reste identique (score coloré, prix, verdict, image, lien LBC, red flags).

### Simplification de `notify.ts`

Supprimer tout le chemin Discord (sendToChannel discord, lookup discord_links, etc.). Le consumer ne gère plus qu'un seul canal : `"webhook"`.

La table `notifications` garde `channel: notificationChannelEnum` mais la valeur sera toujours `"webhook"`. On peut simplifier l'enum ou le garder pour compatibilité — le garder est plus safe (les anciennes notifications Discord restent lisibles dans l'historique).

## Backend — Base de données

### Table `users` — 2 nouvelles colonnes

- `defaultWebhookUrl` : `text`, nullable
- `defaultMinScore` : `integer`, nullable — si null, les recherches utilisent 70 par défaut

### Table `discord_links` — supprimer

Migration : `DROP TABLE discord_links`

### Table `searches` — supprimer 2 colonnes

- Supprimer `notifyDiscord` (`boolean`)
- Supprimer `discordChannelId` (`text`)

Migration Drizzle à générer.

## Backend — Gateway

### Suppression des routes Discord

- Supprimer `packages/gateway/src/routes/discord/`
- Supprimer le montage dans `app.ts` : `app.use("/api/discord/*", discordServiceAuth)` et `app.route("/api/discord", discordApiRoutes)`
- Supprimer le middleware `discordServiceAuth` si plus utilisé ailleurs

### Adaptation des schemas

**`createSearchSchema`** : supprimer `notifyDiscord` et `discordChannelId`
**`updateSearchSchema`** : supprimer `notifyDiscord` et `discordChannelId`
**`searchResponseSchema`** : supprimer `notifyDiscord` et `discordChannelId`

### Settings endpoints

**`GET /api/settings`** : ajouter `defaultWebhookUrl` et `defaultMinScore` dans la réponse
**`PATCH /api/settings`** : accepter `defaultWebhookUrl` (string URL HTTPS, optional, nullable) et `defaultMinScore` (number 0-100, optional, nullable)

**Nouveau endpoint `POST /api/settings/webhook-test`** :

```ts
// Request body
{ url: string } // URL à tester

// Response 200
{ success: true }

// Response 400
{ error: "URL invalide" }

// Response 502
{ error: "Webhook injoignable", details: string }
```

- Valide l'URL (SSRF check)
- Envoie un POST avec un payload test :
  ```json
  {
    "test": true,
    "title": "Test BonPlan Webhook",
    "price": 29900,
    "priceFormatted": "299.00 EUR",
    "score": 85,
    "verdict": "• Ceci est un test\n• Webhook configuré avec succès",
    "url": "https://www.leboncoin.fr/test",
    "image": null,
    "searchQuery": "test",
    "marketPriceLow": 27000,
    "marketPriceHigh": 32000
  }
  ```
- Si l'URL est un webhook Discord, envoie un embed test à la place
- Retourne success/error

## Frontend — Settings

### Onglet "Notifications" (remplace "Webhooks" stub + "Discord")

Supprimer l'onglet "Discord" et remplacer le stub "Webhooks" par un onglet fonctionnel "Notifications" :

- **Champ URL webhook** : input texte, placeholder "https://discord.com/api/webhooks/... ou https://votre-api.com/webhook"
- **Champ score minimum par défaut** : input number 0-100, défaut 70
- **Bouton "Tester"** : envoie un POST à `/api/settings/webhook-test` avec l'URL saisie, affiche success/error avec un toast
- **Bouton "Sauvegarder"** : PATCH `/api/settings`
- **Note explicative** : "Cette URL sera utilisée par défaut pour les nouvelles recherches. Vous pouvez la modifier par recherche."

### Suppression de l'onglet Discord

Supprimer le composant `DiscordTab` et tout le code de linking Discord (code 6 chars, vérification).

## Frontend — SearchCreateDialog

Après le toggle "Analyser les images (IA)", ajouter :

```tsx
<div className="flex items-center gap-3">
  <Switch id="enableWebhook" checked={enableWebhook} onCheckedChange={setEnableWebhook} />
  <Label htmlFor="enableWebhook" className="cursor-pointer">
    Notifications webhook
  </Label>
</div>

{enableWebhook && (
  <FormField label="URL Webhook" htmlFor="webhookUrl" helpText="Discord webhook ou URL custom">
    <Input
      id="webhookUrl"
      placeholder="https://discord.com/api/webhooks/..."
      value={webhookUrl}
      onChange={(e) => setWebhookUrl(e.target.value)}
    />
  </FormField>
)}
```

**Pré-remplissage** : quand le toggle est activé, pré-remplir `webhookUrl` depuis `user.defaultWebhookUrl` (récupéré via les settings).

**onSubmit** : si `enableWebhook` est true, envoyer `notifyWebhook: webhookUrl`. Sinon, `notifyWebhook: null`.

**Aperçu** : ajouter une ligne "Webhook : https://disc... (tronqué)" ou "Désactivé".

### Schema frontend

`searchCreateSchema` : supprimer les références à `notifyDiscord` et `discordChannelId` si elles existent côté frontend.

## Frontend — SearchDetailPage

Ajouter une section "Notifications" :

- Afficher l'URL webhook actuelle ou "Aucun webhook configuré"
- Bouton éditer → champ inline avec validation + sauvegarde via `PATCH /api/searches/:id` (updateSearch accepte déjà `notifyWebhook`)
- Afficher le `minScore` actuel de la recherche

## Ce qui ne change PAS

- Le payload JSON webhook classique (format inchangé)
- La table `notifications` (historique conservé, anciennes notifs Discord restent visibles)
- L'enum `notificationChannelEnum` (garde "webhook" et "discord" pour l'historique)
- La page Notifications (affiche toujours l'historique des envois)
- Le SSRF check existant
- La retry/idempotency logic

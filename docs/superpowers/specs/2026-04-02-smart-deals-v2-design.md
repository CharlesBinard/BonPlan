# Smart Deals v2 — Design Spec

**Date:** 2026-04-02
**Scope:** Scoring IA v2, UX refonte, notifications fiables, historique de prix
**Estimated effort:** 3-4 semaines
**Approach:** Chaque section est indépendante et peut être implémentée/livrée séparément.

---

## 1. Scoring IA v2 + Contexte marché

### Problème

Le scoring repose uniquement sur SearXNG qui renvoie des résultats web génériques. Pas assez de données de prix réels du marché de l'occasion en France pour que l'IA produise des scores fiables.

### Sources de prix marché

Enrichir le contexte via des requêtes SearXNG ciblées par site + exploiter les données internes :

| Source | Données | Méthode |
|--------|---------|---------|
| **SearXNG `site:backmarket.fr`** | Prix reconditionné (référence haute) | Requête SearXNG existante avec filtre site |
| **SearXNG `site:rakuten.com`** | Prix occasion structuré | Idem |
| **SearXNG générique** | Fallback articles de niche | Existant, conservé |
| **`price_history` interne** | Prix observés + annonces disparues (≈ vendues) | Query DB : annonces qui ne sont plus scrapées depuis 48h avec leur dernier prix connu |

Note : LBC "vendu" et BackMarket direct ne sont pas scrapables via HTTP (pages JS-rendered, anti-bot). On passe par SearXNG qui indexe leurs résultats via les moteurs de recherche.

Cache Redis avec TTL 24h (au lieu de 1h actuellement).

### Prompts IA améliorés

Fournir à l'IA un tableau structuré :
```
Comparables trouvés :
- BackMarket reconditionné : "RTX 4090 Gaming OC" → 699€ (source: backmarket.fr)
- Rakuten occasion : "RTX 4090 FE" → 640€ (source: rakuten.com)
- Historique BonPlan : 3 annonces similaires vendues entre 580€ et 620€ (derniers 30j)
- Web : "RTX 4090 prix occasion" → 600-650€ (sources multiples)
Prix médian occasion estimé : 620€
Prix neuf référence : 1599€
```

L'IA retourne :
- Score 0-100 avec explication en **2-3 bullet points** (pas un paragraphe)
- `comparables`: tableau des 3-5 annonces/prix comparables (titre, prix, source, date)
- `listingType`, `matchesQuery`, `verdict`, `redFlags` (existants)

Le champ `discount` (pourcentage de décote) est **calculé côté code** dans `analyze.ts` : `Math.round((1 - price / marketMedian) * 100)`. Pas demandé à l'IA.

Le champ `marketMedian` est calculé côté code à partir de la médiane de tous les prix comparables collectés.

### Modifications `fetchMarketContext()`

Changer le type de retour de `string | null` à un objet structuré :

```typescript
type MarketResearchResult = {
  context: string;           // Texte formaté pour le prompt IA
  comparables: Comparable[]; // Données structurées pour stockage
  median: number | null;     // Prix médian en cents
} | null;

type Comparable = {
  title: string;
  price: number;  // cents
  source: string; // "backmarket.fr", "rakuten.com", "bonplan-history", "searxng"
  date?: string;  // ISO date si disponible
};
```

Chaque source est fetchée indépendamment avec try/catch + timeout 10s. Une source en erreur ne bloque pas les autres (dégradation gracieuse).

### Nouvelles fonctions dans market-research.ts

- `buildSiteQueries(query, site)` — construit des requêtes SearXNG avec filtre `site:`
- `fetchInternalHistory(db, query)` — query `price_history` pour annonces disparues (pas re-scrapées depuis 48h)
- Modifier `fetchMarketContext()` pour agréger toutes les sources et retourner `MarketResearchResult`

Si le fichier grossit trop, splitter en sous-modules : `market-research/searxng.ts`, `market-research/internal.ts`, `market-research/index.ts`.

### Schema DB

Ajouter à `analyses` (nullable, backward-compatible avec analyses existantes) :
- `comparables` (jsonb) — tableau de comparables
- `marketMedian` (integer, cents, nullable)
- `discount` (integer, pourcentage, nullable) — calculé côté code

### Schema API

Étendre `analysisResponseSchema` dans `packages/gateway/src/schemas/shared.ts` avec les 3 nouveaux champs.

---

## 2. Dashboard & UX repensés

### Fil d'activité (dashboard)

Composant `ActivityFeed` sur le dashboard. **Limité aux événements opérationnels** (pas les listings — la FeedPage existante gère ça) :

- `search.error` → "Recherche iPhone 15 — Erreur de mapping"
- `search.blocked` → "Recherche HDD — Bloqué, retry dans 25min"
- `notification.sent` → "Alerte envoyée sur Discord" (avec status sent/failed)

Stockage : 50 derniers événements en mémoire côté client (WebSocket events existants). Se vide au refresh — acceptable pour un flux d'activité opérationnel.

Pattern visuel : card-row existant (`rounded-xl border border-border bg-card px-4 py-3`) avec icône + texte + timestamp relatif. Pas de timeline verticale avec dots (nouveau pattern à éviter).

### Cards recherche améliorées

Chaque `SearchCard` affiche :
- **Statut explicite** : icône + badge coloré + texte ("Actif · scrape il y a 3min", "Bloqué · retry à 14h32", "En pause")
- **Métriques** : nombre d'annonces / bonnes affaires
- **Prochain scrape** : temps restant (calculé client-side `lastScrapedAt` + `intervalMin`)
- **Barre de progression** si statut "mapping" (spinner + "Analyse IA en cours...")

### Score sur ListingCard

Ne pas surcharger la card. Approche minimaliste :
- Garder le `ScoreBar` existant (label + score + barre gradient)
- Ajouter un **badge discount** à côté du prix quand `discount` est disponible : pill vert "-35%" ou rouge "+10%"
- La raison détaillée (bullet points) et les comparables → affichés uniquement sur `ListingDetailPage`

Sur `ListingDetailPage` :
- Section "Analyse marché" sous le verdict existant : comparables en liste (titre, prix, source)
- Discount mis en avant visuellement

### Filtres avancés (SearchDetailPage)

Garder visibles : tri (existant) + score minimum (existant).

Ajouter un bouton **"Filtres"** avec badge du nombre de filtres actifs. Au clic :
- Desktop : `Popover` avec les filtres secondaires
- Mobile : `Sheet` (slide-up)

Filtres secondaires :
- Fourchette de prix (inputs min/max en €)
- Type vendeur (pro / particulier / tous)
- Période (24h, 7j, 30j, tout)

API : étendre `listingsQuerySchema` avec `priceMin` (integer, cents), `priceMax` (integer, cents), `sellerType` (enum), `since` (ISO date string).

### Onglets sur SearchDetailPage

Remplacer la page monolithique par des onglets (composant `Tabs` shadcn existant) :
- **"Annonces"** — grille de listings + filtres (contenu actuel)
- **"Tendances"** — graphique de prix (Section 4)

### Notifications in-app

**Desktop :** icône cloche dans `TopBar` avec badge unread count + dropdown (10 dernières notifications).
**Mobile :** badge unread ajouté sur l'icône cloche existante dans `MobileNav`. Pas de cloche dans TopBar sur mobile (redondant).

Le `notification.sent` WebSocket event incrémente le compteur en temps réel (pas de polling).

Ajout à `notifications` table : `readAt` (timestamp nullable). `null` = non lu.
Nouvel endpoint : `GET /api/notifications/unread-count` → `{ count: number }`.
Le compteur se reset quand le dropdown est ouvert : `PATCH /api/notifications/mark-read`.

---

## 3. Notifications fiables + Digest

### Debug et fiabilité

**Page notifications enrichie :**
- Afficher `notifications.error` (déjà stocké en DB) pour chaque notification en échec
- Bouton **"Re-envoyer"** : `POST /api/notifications/:id/retry`
  - Remet `retryCount` à 0 et `status` à "pending"
  - Envoie un event `Stream.NotificationRetry` (nouveau stream)
  - Le notifier consume cet event et re-tente l'envoi
  - Réponse : `{ success: boolean }` ou `404` si notification pas trouvée
  - Auth : vérifier que la notification appartient au user

**Test de notification :**
- Bouton "Tester" dans SettingsPage
- `POST /api/settings/test-notification` avec `{ channel: "webhook" | "discord" }`
- Le gateway publie un event `Stream.TestNotification` avec `{ userId, channel }`
- Le notifier consume et envoie un message de test
- Feedback UI : spinner sur le bouton pendant l'envoi, puis toast success/error + alert inline persistant si erreur

### Mode Digest

Nouvelle option **par recherche**, configurable sur la page détail recherche (PAS dans le dialog de création — garder le flow de création simple, default "realtime").

**Schema :**
- `searches.notifyMode` : nouveau pgEnum `notify_mode_enum` ("realtime" | "digest"), default "realtime"
- `searches.digestHour` : integer 0-23, default 8, CHECK constraint `BETWEEN 0 AND 23`
- `searches.lastDigestAt` : timestamp nullable — quand le dernier digest a été envoyé

**Architecture digest :**
- `setInterval` dans le `main()` du notifier (pas de worker séparé), check toutes les 15 minutes
- Le check : query `searches WHERE notifyMode = 'digest'` + index sur `notifyMode`
- Pour chaque recherche en mode digest : si `currentHour === digestHour` et `lastDigestAt` est null ou date d'un jour précédent :
  - Collecter les analyses avec `score >= minScore` et `createdAt > lastDigestAt`
  - Si 0 résultats → ne rien envoyer (pas de digest vide)
  - Si résultats → construire et envoyer le digest (top 5 par score)
  - Mettre à jour `lastDigestAt`

**En mode digest, `processNotification()` skip l'envoi immédiat** pour les recherches avec `notifyMode = "digest"`. L'analyse est toujours sauvegardée en DB — le digest job la ramassera.

**Digest notification storage :**
- `notifications.analysisId` rendu nullable pour les digests
- Ajouter `notifications.digestSearchId` (uuid nullable) — référence la recherche pour laquelle le digest a été envoyé
- Le payload contient le tableau complet des deals inclus

**Formats :**
- Discord : un seul embed riche avec les top 5 deals, classés par score, prix + lien direct
- Webhook : un seul payload JSON `{ type: "digest", searchId, deals: [...] }`

### Email

Ajouter le canal email :
- Étendre `notificationChannelEnum` avec `"email"` — requiert migration `ALTER TYPE notification_channel ADD VALUE 'email'` (hors transaction en PostgreSQL)
- Ajouter à `searches` : `notifyEmail` (boolean, default false), `emailAddress` (text nullable, override de l'email du compte)
- Ajouter `RESEND_API_KEY` à la config shared (`configSchema` + `.env.example`)
- Intégration via package `resend` (HTTP API)
- Le notifier doit pouvoir query la table `users` pour l'email par défaut — nouvelle dépendance
- Template HTML simple pour notifications unitaires et digests
- Erreur permanente : bounce/spam → marquer la notification comme failed
- Erreur transiente : timeout/5xx → retry via PEL (existant)

---

## 4. Historique de prix + Comparaison

### Graphique de prix par recherche

**Nouvel endpoint :**
`GET /api/searches/:id/price-trends?period=7d|30d|90d`

- Default : `30d`
- Validation : `period: z.enum(["7d", "30d", "90d"]).default("30d")`

Retourne :
```json
{
  "trends": [
    { "date": "2026-04-01", "median": 58000, "min": 42000, "max": 75000, "count": 12 }
  ]
}
```

Query SQL avec `percentile_cont(0.5)` via `sql` template literals (Drizzle n'a pas de support natif).

Edge cases :
- 1 seul jour de données → afficher un seul point (pas de courbe)
- 0 données → message "Pas encore assez de données" à la place du graphique

**Frontend :**
- Composant `PriceTrendChart` dans l'onglet "Tendances" de `SearchDetailPage`
- Librairie `recharts` (léger, React, bien maintenu)
- Courbe médiane + zone min/max en opacité réduite
- Sélecteur de période : 7j / 30j / 90j
- Skeleton loading state
- **Dark mode** : configurer axes, grille et tooltips avec les couleurs du thème (`hsl(var(--muted-foreground))`)

### Historique de prix par listing

**Nouvel endpoint :**
`GET /api/searches/:searchId/listings/:listingId/price-history`

(Reste nested sous searches pour suivre le pattern existant — pas de nouveau top-level `/api/listings/`)

Retourne :
```json
{
  "history": [
    { "price": 58000, "observedAt": "2026-04-01T10:30:00Z" }
  ]
}
```

**Frontend :**
- Mini sparkline sur `ListingDetailPage` dans la section "Analyse marché"
- Si prix stable : "Prix stable depuis [date]" (pas de graphique inutile)
- Si prix a baissé : highlight vert "↓ -50€ depuis la première observation"
- Si une seule observation : "Première observation le [date]"

### Vue comparaison

**UX — mode toggle sur SearchDetailPage :**
- Bouton "Comparer" dans la barre de filtres (à côté du tri)
- Active un mode sélection : checkboxes sur chaque `ListingCard` (max 3)
- Quand 2+ sélectionnés : bouton "Voir la comparaison" apparaît inline
- Au clic : `Sheet` (slide-over panel, composant shadcn existant) en pleine largeur

**Contenu de la comparaison :**
- Photo principale
- Prix + badge discount
- Score + verdict (bullet points)
- Red flags
- Comparables marché
- Lien direct vers l'annonce LBC

**Limitations :**
- Comparaison scoped à une seule recherche (listings déjà chargés côté client)
- Minimum 2 listings, maximum 3
- Bouton "Comparer" disabled si < 2 sélectionnés
- State de sélection perdu au changement de page (React state, pas persisté)
- Si un listing n'a pas d'analyse (score null) : afficher "En attente d'analyse" dans la colonne

---

## Migration DB consolidée

Une seule migration Drizzle :

```sql
-- Nouveaux enums
CREATE TYPE notify_mode AS ENUM ('realtime', 'digest');

-- Extension enum existant (hors transaction)
ALTER TYPE notification_channel ADD VALUE 'email';

-- analyses: nouveaux champs scoring v2
ALTER TABLE analyses ADD COLUMN comparables jsonb;
ALTER TABLE analyses ADD COLUMN market_median integer;
ALTER TABLE analyses ADD COLUMN discount integer;

-- searches: digest + email
ALTER TABLE searches ADD COLUMN notify_mode notify_mode NOT NULL DEFAULT 'realtime';
ALTER TABLE searches ADD COLUMN digest_hour integer NOT NULL DEFAULT 8;
ALTER TABLE searches ADD COLUMN last_digest_at timestamptz;
ALTER TABLE searches ADD COLUMN notify_email boolean NOT NULL DEFAULT false;
ALTER TABLE searches ADD COLUMN email_address text;
ALTER TABLE searches ADD CONSTRAINT digest_hour_range CHECK (digest_hour BETWEEN 0 AND 23);

-- notifications: read tracking + digest support
ALTER TABLE notifications ADD COLUMN read_at timestamptz;
ALTER TABLE notifications ALTER COLUMN analysis_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN digest_search_id uuid REFERENCES searches(id) ON DELETE CASCADE;

-- Index pour le digest CRON
CREATE INDEX idx_searches_notify_mode ON searches(notify_mode) WHERE notify_mode = 'digest';
```

Note : `ALTER TYPE ... ADD VALUE` ne peut pas être dans une transaction. Utiliser une migration séparée ou un script manuel pour cette commande.

Les analyses existantes auront `comparables`, `marketMedian`, et `discount` à null — le gateway et le frontend doivent gérer ces cas gracieusement.

---

## Ordre d'implémentation recommandé

1. **Scoring IA v2** — Coeur de la valeur, tout le reste en bénéficie
2. **Notifications fiables** — Fix ce qui est cassé avant d'ajouter du neuf
3. **Dashboard & UX** — Exploite les nouvelles données du scoring v2
4. **Historique de prix + Comparaison** — Polish final

Chaque section est indépendante et livrable séparément.

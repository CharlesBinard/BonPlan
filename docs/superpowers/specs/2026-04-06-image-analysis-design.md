# Image Analysis — Design Spec

**Date**: 2026-04-06
**Status**: Approved

## Overview

Ajouter une option par recherche permettant à l'IA d'analyser les photos des listings pour extraire des informations factuelles (CrystalDiskInfo, benchmarks, diagnostics batterie, état physique, etc.) et ajuster le score en conséquence.

## Architecture

### Approche : Second pass dans l'analyzer

L'analyse d'images est un **second pass** après l'analyse texte classique. Seuls les listings avec un score texte ≥ 60 sont analysés visuellement. Cela économise massivement les tokens AI (70-80% des listings sont éliminés par le texte).

**Flow complet :**
1. Batch texte (5 listings) → scores initiaux (inchangé)
2. Si `search.analyzeImages === true` : filtrer les listings avec score ≥ 60
3. Pour chaque listing qualifié : appel AI individuel avec les images → infos extraites + ajustement de score
4. Mise à jour de la table `analyses` avec le champ `imageAnalysis`

## Base de données

### Table `searches` — 1 nouvelle colonne

- `analyzeImages` : `boolean`, NOT NULL, default `false`

### Table `analyses` — 1 nouvelle colonne

- `imageAnalysis` : `jsonb`, nullable

**Structure du JSONB `imageAnalysis` :**

```ts
{
  findings: string[];        // Infos factuelles extraites ("CrystalDisk: 98% santé, 2400h")
  condition: string;         // État général observé ("Bon état, légères traces d'usure")
  scoreAdjustment: number;   // Ajustement du score (-20 à +20)
  adjustedScore: number;     // Score final après ajustement (clampé 0-100)
  modelUsed: string;         // Modèle AI utilisé pour l'analyse images
}
```

Le `score` existant dans `analyses` reste le score texte pur. `adjustedScore` dans `imageAnalysis` est le score final tenant compte des images.

Migration Drizzle à générer.

## Backend — Gateway

### Adaptation schemas

- **`createSearchSchema`** : ajouter `analyzeImages: z.boolean().default(false)`
- **`searchResponseSchema`** : ajouter `analyzeImages: z.boolean()`
- **`analysisResponseSchema`** : ajouter `imageAnalysis: z.any().nullable()` (JSONB opaque pour le transport)
- **Handler `createSearchRoute`** : passer `analyzeImages: body.analyzeImages` dans le `.values()`

## Backend — AI SDK

### Nouvelle fonction `generateStructuredWithImages`

**Fichier** : `packages/ai/src/sdk.ts`

```ts
async function generateStructuredWithImages<SCHEMA extends z.ZodType>(params: {
  providerType: ProviderType;
  apiKey: string;
  model: string;
  schema: SCHEMA;
  system: string;
  prompt: string;
  imageUrls: string[];
  maxOutputTokens?: number;
}): Promise<{ data: z.infer<SCHEMA>; usage?: { inputTokens: number; outputTokens: number } }>
```

- Construit les content parts multimodaux du Vercel AI SDK :
  - `{ type: "text", text: prompt }`
  - Pour chaque URL : `{ type: "image", image: new URL(url) }`
- Utilise `generateText()` avec `Output.object({ schema })` comme `generateStructured`
- Même error mapping que `generateStructured`

Exporter depuis `packages/ai/src/index.ts`.

## Backend — Analyzer

### Nouveau fichier `packages/analyzer/src/image-analysis.ts`

**Schema Zod pour le résultat :**

```ts
const imageAnalysisSchema = z.object({
  findings: z.array(z.string()),
  condition: z.string(),
  scoreAdjustment: z.number().min(-20).max(20).transform(Math.round),
});
```

**Fonction `analyzeListingImages()` :**

```ts
async function analyzeListingImages(params: {
  listing: ListingRow;
  existingAnalysis: { score: number; verdict: string; redFlags: string[] };
  providerType: ProviderType;
  apiKey: string;
  userModel: string;
}): Promise<ImageAnalysisResult>
```

- Appel individuel (1 listing) via `generateStructuredWithImages()`
- Passe toutes les URLs d'images du listing
- Le prompt reçoit le contexte du premier pass (titre, prix, score, verdict)
- Retourne `{ findings, condition, scoreAdjustment, adjustedScore, modelUsed }`
- `adjustedScore = Math.max(0, Math.min(100, existingScore + scoreAdjustment))`

### Prompt image (dans `packages/analyzer/src/prompts.ts`)

Nouvelle fonction `buildImageAnalysisPrompt()` :

**System prompt :**
- Tu es un expert en analyse visuelle de produits d'occasion
- Examine chaque image attentivement
- Extrais les informations factuelles visibles (diagnostics logiciels, benchmarks, étiquettes, factures, numéros de série)
- Évalue l'état physique (rayures, bosses, usure, propreté)
- Identifie les accessoires visibles et la complétude du lot
- Identifie les red flags visuels (photos stock, photos floues volontairement, incohérences)

**User prompt :**
- Contexte : titre, prix, score texte actuel, verdict, red flags du premier pass
- "Examine les images ci-jointes et fournis ton analyse"

**Réponse attendue :**
- `findings` : liste de faits extraits, chacun commençant par la source ("CrystalDisk: ...", "Étiquette: ...", "Photo 3: ...")
- `condition` : résumé en une phrase de l'état général
- `scoreAdjustment` : entre -20 et +20, justifié par les findings

### Intégration dans `analyze.ts`

Après la boucle de batch existante (après ligne ~550), ajouter :

```ts
// Second pass: image analysis for high-scoring listings
if (search.analyzeImages) {
  const qualifiedListings = /* listings just analyzed with score >= 60 */;
  for (const listing of qualifiedListings) {
    try {
      const result = await analyzeListingImages({ ... });
      await db.update(analyses)
        .set({ imageAnalysis: result })
        .where(eq(analyses.listingId, listing.id) & eq(analyses.searchId, searchId));
      // Re-publish event with adjusted score
      await publish(redis, Stream.ListingAnalyzed, {
        searchId, userId, listingId: listing.id,
        analysisId, score: result.adjustedScore, verdict
      });
    } catch (err) {
      logger.warn("Image analysis failed", { listingId: listing.id, error });
      // Score texte reste intact — pas de rupture
    }
  }
}
```

**Robustesse** : si l'analyse d'images échoue (timeout, image inaccessible, erreur AI), le score texte reste intact. L'erreur est loggée mais n'interrompt pas le traitement.

## Frontend

### `SearchCreateDialog` — nouveau toggle

Après le toggle "Autoriser les lots / bundles", ajouter :

```tsx
<div className="flex items-center gap-3">
  <Switch id="analyzeImages" checked={analyzeImages} onCheckedChange={setAnalyzeImages} />
  <Label htmlFor="analyzeImages" className="cursor-pointer">
    Analyser les images (IA)
  </Label>
</div>
```

Help text ou description : "L'IA examine les photos pour extraire des infos (diagnostics, état, benchmarks)"

**State** : `const [analyzeImages, setAnalyzeImages] = useState(false);`
**Reset** : `setAnalyzeImages(false);`
**onSubmit** : ajouter `analyzeImages` dans le `safeParse()`.

### Frontend schema

`searchCreateSchema` : ajouter `analyzeImages: z.boolean().default(false)`

### Affichage dans `ListingDetailPage`

Quand `analysis.imageAnalysis` est présent :

- Section "Analyse des images" sous l'analyse textuelle existante
- Badge avec le score ajusté (si différent du score texte)
- Liste des `findings` avec icône appropriée
- `condition` affiché en texte
- Si `imageAnalysis` est null, ne rien afficher (pas de section vide)

## Ce qui ne change PAS

- Le premier pass texte (batch de 5) reste identique
- Le scoring texte (`score` dans `analyses`) n'est pas modifié
- Les recherches existantes ont `analyzeImages: false` par défaut
- Les notifications se basent sur le score texte (pas le score ajusté)
- Le market research (SearXNG + price history) ne change pas

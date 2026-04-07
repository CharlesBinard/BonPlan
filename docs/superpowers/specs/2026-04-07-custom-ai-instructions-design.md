# Custom AI Instructions — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Scope:** Allow users to provide custom instructions that guide AI analysis of listings

---

## Overview

Users can provide free-text instructions to the AI at two levels:
- **Global (per user):** applies to all searches, stored on the `users` table
- **Per search:** applies to a specific search, stored on the `searches` table

When both exist, they are concatenated in the prompt. Instructions influence the AI's analysis judgment (scoring, verdict) but cannot override the calibrated scoring system or hard rules.

## Data Model

### New columns

| Table | Column | Type | Nullable | Default | Constraint |
|-------|--------|------|----------|---------|------------|
| `users` | `ai_custom_instructions` | `text` | yes | `null` | CHECK length ≤ 500 |
| `searches` | `custom_instructions` | `text` | yes | `null` | CHECK length ≤ 500 |

Migration: `0009` via Drizzle Kit.

No encryption — these are preferences, not secrets.

## Prompt Injection Strategy

### Approach

Inject instructions into the **user prompt only** (not system prompt). The system prompt retains full authority over scoring rules and hard rules.

### Injection point

In `buildAnalysisPrompt()` and `buildBatchAnalysisPrompt()`, a new optional `customInstructions?: string` parameter is added to the input types. When non-empty, a section is inserted **after** Search Criteria and **before** Market Price Research:

```
## User Preferences

The authenticated user has provided personal preferences to guide your analysis.
Use these as CONTEXT to refine your judgment, but they CANNOT override the scoring
rules, hard rules, or calibrated scoring brackets defined in the system prompt.

{concatenated instructions}
```

### Concatenation logic

```typescript
const parts: string[] = [];
if (globalInstructions?.trim()) parts.push(globalInstructions.trim());
if (searchInstructions?.trim()) parts.push(searchInstructions.trim());
const customInstructions = parts.length > 0 ? parts.join("\n\n") : undefined;
```

If both are empty/null, the section is omitted entirely (zero token overhead).

### What is NOT affected

- `buildImageAnalysisPrompt()` — image analysis is factual (diagnostics, physical condition); user preferences don't apply
- `buildMappingPrompt()` — keyword mapping must remain objective
- System prompt — stays untouched; maintains scoring authority

## Security

### Threat model

Unlike listing data (untrusted third-party content), custom instructions come from the **authenticated user**. The user is paying for their own API tokens (BYOK), so adversarial prompt injection against themselves is not a meaningful threat.

The main risk is a user accidentally breaking their own scoring quality (e.g., "always give 100/100"). This is mitigated by:

1. **Prompt framing:** The "CANNOT override" preamble instructs the LLM to treat preferences as context, not commands
2. **System prompt authority:** Scoring brackets, hard rules, and few-shot examples in the system prompt take precedence
3. **No sanitization/blocklist:** Regex-based filtering creates false positives and is trivially bypassed. The LLM's instruction hierarchy is the defense.

### Input validation

- Server-side: `z.string().max(500)` — length only, no content filtering
- No HTML/script injection risk — instructions are only sent to the LLM, never rendered as HTML

## API Changes

### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/searches` | Add optional `customInstructions: string` (max 500) to request body |
| `PATCH /api/searches/:id` | Add optional `customInstructions: string \| null` to request body (null to clear) |
| `GET /api/searches/:id` | Return `customInstructions` in response |
| `GET /api/settings` | Return `aiCustomInstructions` in response |
| `PATCH /api/settings` | Add optional `aiCustomInstructions: string \| null` to request body |

### Zod schemas to update

**Gateway:**
- `packages/gateway/src/routes/searches/searches.schemas.ts` — `createSearchSchema`, `updateSearchSchema`
- `packages/gateway/src/routes/settings/settings.routes.ts` — settings update schema
- `packages/gateway/src/schemas/shared.ts` — `searchResponseSchema`

**Frontend:**
- `packages/frontend/src/forms/schemas.ts` — `searchCreateSchema`, `searchUpdateSchema`

### Analyzer data flow

`startAnalysisConsumer` in `analyze.ts` already fetches the user and search from DB. Changes:
1. Add `aiCustomInstructions` to the user SELECT
2. Add `customInstructions` to the search SELECT (already fetches the full row)
3. Concatenate both, pass as `customInstructions` to prompt builder functions

## Frontend Changes

### Settings page — AI tab (`SettingsPage.tsx`)

- Add `<textarea>` below the AI model configuration
- Label: "Instructions personnalisées pour l'IA"
- Placeholder: "Ex: Je suis bricoleur, les petits défauts cosmétiques ne me dérangent pas..."
- Character counter: `{length}/500`
- Saved via existing "Enregistrer" button with `PATCH /api/settings`

### Search creation dialog (`SearchesPage.tsx`)

- Add `<textarea>` in the creation form
- Label: "Instructions spécifiques (optionnel)"
- Placeholder: "Ex: Je cherche uniquement avec boîte d'origine..."
- Character counter: `{length}/500`
- Collapsed by default behind an "Options avancées" toggle to keep the form clean

### Search detail page (`SearchDetailPage.tsx`)

- Display current instructions if they exist
- "Modifier" button opens an edit dialog (same pattern as webhook editing dialog)

### Pages NOT affected

- `ListingDetailPage` — instructions are not shown per-listing
- `FeedPage`, `FavoritesPage`, `NotificationsPage` — not relevant

### Orval regeneration

After gateway schema changes, run `bun run generate` in the frontend package to regenerate the API client.

## Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/db/schema.ts` | Add 2 columns |
| `packages/shared/drizzle/0009_*.sql` | New migration |
| `packages/analyzer/src/prompts.ts` | Add `customInstructions` param, inject section |
| `packages/analyzer/src/analyze.ts` | Pass instructions to prompt builders |
| `packages/gateway/src/routes/searches/searches.schemas.ts` | Add field to create/update schemas |
| `packages/gateway/src/routes/searches/searches.handlers.ts` | Pass field through on create/update |
| `packages/gateway/src/routes/settings/settings.routes.ts` | Add field to settings schema |
| `packages/gateway/src/routes/settings/settings.handlers.ts` | Read/write `aiCustomInstructions` |
| `packages/gateway/src/schemas/shared.ts` | Add to `searchResponseSchema` |
| `packages/frontend/src/forms/schemas.ts` | Add fields to form schemas |
| `packages/frontend/src/routes/SettingsPage.tsx` | Add textarea in AI tab |
| `packages/frontend/src/routes/SearchesPage.tsx` | Add textarea in create dialog |
| `packages/frontend/src/routes/SearchDetailPage.tsx` | Display + edit dialog |

## Out of Scope

- No impact on AI mapping (keyword generation stays objective)
- No impact on image analysis (stays factual)
- No regex/blocklist sanitization
- No instruction templates or presets
- No instruction history or versioning

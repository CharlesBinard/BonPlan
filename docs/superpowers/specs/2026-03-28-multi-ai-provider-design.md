# Multi-AI Provider Support — Design Spec

**Date:** 2026-03-28
**Status:** Approved (revised after review)
**Scope:** New `@bonplan/ai` package, schema migration, gateway/analyzer/orchestrator refactor, frontend settings UI

---

## 1. Overview

BonPlan currently hardcodes the Anthropic SDK in two packages (analyzer, orchestrator). This design adds support for 4 AI providers: **Claude, OpenAI, Gemini, Minimax**. Each user chooses one provider, one model, and stores one API key (BYOK model).

### Providers & Model Catalogue

| Provider | Fast | Balanced | Premium |
|----------|------|----------|---------|
| **Claude** | `claude-haiku-4-5` | `claude-sonnet-4-6` | `claude-opus-4-6` |
| **OpenAI** | `gpt-5.4-nano` | `gpt-5.4-mini` | `gpt-5.4` |
| **Gemini** | `gemini-3.1-flash-lite` | `gemini-3-flash` | `gemini-3.1-pro` |
| **Minimax** | `MiniMax-M2.1` | `MiniMax-M2.5` | `MiniMax-M2.7` |

**Constraint:** One provider + one key per user. Switching provider requires entering a new API key (old key is overwritten). Switching model within the same provider does not require re-entering the key.

### Implementation Order

1. `@bonplan/shared` — enums, catalogue, schema columns
2. `@bonplan/ai` — new package with provider implementations
3. Schema migration — `drizzle-kit generate` + `drizzle-kit migrate`
4. Gateway — settings routes update
5. Analyzer — migrate to `@bonplan/ai`
6. Orchestrator — migrate to `@bonplan/ai`
7. Frontend — settings UI, types, banner

---

## 2. Package: `@bonplan/ai`

New package at `packages/ai/` — encapsulates all AI provider logic.

### 2.1 Structure

```
packages/ai/
  package.json          # depends on @bonplan/shared, 3 AI SDKs
  tsconfig.json
  src/
    index.ts            # public exports: AiProvider, getProvider, errors
    provider.ts         # AiProvider interface, error classes
    factory.ts          # getProvider(type) -> provider instance
    providers/
      claude.ts         # Anthropic SDK
      openai.ts         # OpenAI SDK
      gemini.ts         # Google GenAI SDK
      minimax.ts        # OpenAI SDK + custom baseURL
```

### 2.2 Interface

```typescript
// Named AiProvider (the interface). The enum in @bonplan/shared is named ProviderType.
interface AiProvider {
  chat(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
    temperature?: number;
    responseFormat?: "text" | "json";
  }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}
```

**Key decisions:**
- `apiKey` at call time — SDKs (Anthropic, OpenAI, Google GenAI) bind the key at constructor time, so each `chat()` call creates a fresh SDK client internally. Client construction is cheap (no network call), matching the current codebase pattern where `new Anthropic({ apiKey })` is created per batch. No singleton caching of SDK clients — avoids memory leaks from unbounded user keys.
- `responseFormat: "json"` enables native JSON mode where supported (see Section 2.6)
- `usage` returned for cost visibility (users pay with their own keys)
- JSON parsing stays in analyzer/orchestrator — not the provider's responsibility

### 2.3 Factory

```typescript
import type { ProviderType } from "@bonplan/shared/ai-models";

function getProvider(type: ProviderType): AiProvider;
```

Returns the appropriate provider implementation. Each call to `provider.chat()` creates a fresh SDK client with the given `apiKey`. No client caching.

### 2.4 Error Classes

```typescript
class AiAuthError extends Error {
  // Wraps: 401 + 403 from any provider
  // Claude: Anthropic.AuthenticationError or status 401/403
  // OpenAI/Minimax: OpenAI.AuthenticationError or status 401/403
  // Gemini: status 403 / PERMISSION_DENIED
  // Each provider catches BOTH typed SDK errors AND raw status code checks
}

class AiQuotaError extends Error {
  // Wraps: 402 (insufficient credits / quota exhausted)
  // Distinct from AiAuthError — key is valid but account has no balance
}

class AiRateLimitError extends Error {
  retryAfterMs?: number;
  // Wraps: 429 from any provider
}
```

Each provider implementation catches SDK-specific errors and normalizes to these classes. All other errors propagate as-is. Providers must catch both typed error classes (e.g., `Anthropic.AuthenticationError`) AND raw status code checks (401, 402, 403, 429) to cover edge cases.

### 2.5 Provider Implementations

**Claude** (`@anthropic-ai/sdk`):
- Creates `new Anthropic({ apiKey, maxRetries: 2 })` per `chat()` call
- `client.messages.create()` with `system` + `messages`
- Auth errors: `Anthropic.AuthenticationError` or status 401/403

**OpenAI** (`openai` SDK):
- Creates `new OpenAI({ apiKey, maxRetries: 2 })` per `chat()` call
- `client.chat.completions.create()` with `messages` array
- When `responseFormat: "json"`: adds `response_format: { type: "json_object" }`
- Auth errors: `OpenAI.AuthenticationError` or status 401/403

**Gemini** (`@google/genai`):
- Creates `new GoogleGenAI(apiKey)` per `chat()` call
- `client.models.generateContent()` with system instruction + contents
- When `responseFormat: "json"`: adds `generationConfig.responseMimeType: "application/json"`
- Auth errors: status 403 / PERMISSION_DENIED
- **No built-in retry** — implement a simple retry wrapper (max 2 retries on 429/500)

**Minimax** (`openai` SDK with `baseURL: "https://api.minimax.io/v1"`):
- Creates `new OpenAI({ apiKey, baseURL: "https://api.minimax.io/v1", maxRetries: 2 })` per `chat()` call
- Same implementation as OpenAI provider, different baseURL
- Same JSON mode, same error handling
- Model names are PascalCase: `MiniMax-M2.7`, not lowercase

### 2.6 Prompt Handling

**No separate prompt adapter class.** JSON instructions in prompts are kept for ALL providers:
- The existing prompts already contain `"Respond with ONLY a JSON object (no markdown, no explanation)"` followed by the output schema. This instruction is NOT stripped for any provider.
- For providers with native JSON mode (OpenAI, Gemini, Minimax): the native mode is enabled IN ADDITION to the prompt instruction. The instruction is redundant but harmless, and OpenAI's JSON mode actually requires "JSON" to appear in the prompt.
- For Claude: no native JSON mode exists, the instruction alone is sufficient (current behavior).

The domain-level prompts (analysis scoring, search mapping, few-shot examples) remain in analyzer and orchestrator unchanged.

### 2.7 Dependencies

Add to `packages/ai/package.json`:
```json
{
  "name": "@bonplan/ai",
  "dependencies": {
    "@bonplan/shared": "workspace:*",
    "@anthropic-ai/sdk": "^0.80.0",
    "openai": "^4.0.0",
    "@google/genai": "^1.0.0"
  }
}
```

3 SDKs total. Minimax reuses the OpenAI SDK. Also add `@bonplan/ai` to `packages/analyzer/package.json` and `packages/orchestrator/package.json` dependencies.

---

## 3. Enums & Catalogue in `@bonplan/shared`

### 3.1 New File: `packages/shared/src/ai-models.ts`

Zero Node.js dependencies — safe for browser import.

```typescript
// Enum renamed to ProviderType to avoid collision with AiProvider interface in @bonplan/ai
export enum ProviderType {
  Claude = "claude",
  OpenAI = "openai",
  Gemini = "gemini",
  Minimax = "minimax",
}

export enum AiModelTier {
  Fast = "fast",
  Balanced = "balanced",
  Premium = "premium",
}

export type ModelOption = {
  id: string;
  label: string;
  tier: AiModelTier;
  recommended?: boolean;
};

// Provider display labels for the frontend
export const PROVIDER_LABELS: Record<ProviderType, string> = {
  [ProviderType.Claude]: "Claude (Anthropic)",
  [ProviderType.OpenAI]: "OpenAI",
  [ProviderType.Gemini]: "Gemini (Google)",
  [ProviderType.Minimax]: "MiniMax",
};

// Single source of truth — model catalogue
export const AI_MODELS: Record<ProviderType, ModelOption[]> = {
  [ProviderType.Claude]: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", tier: AiModelTier.Fast },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: AiModelTier.Balanced, recommended: true },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6", tier: AiModelTier.Premium },
  ],
  [ProviderType.OpenAI]: [
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", tier: AiModelTier.Fast },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", tier: AiModelTier.Balanced, recommended: true },
    { id: "gpt-5.4", label: "GPT-5.4", tier: AiModelTier.Premium },
  ],
  [ProviderType.Gemini]: [
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", tier: AiModelTier.Fast },
    { id: "gemini-3-flash", label: "Gemini 3 Flash", tier: AiModelTier.Balanced, recommended: true },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", tier: AiModelTier.Premium },
  ],
  [ProviderType.Minimax]: [
    { id: "MiniMax-M2.1", label: "MiniMax M2.1", tier: AiModelTier.Fast },
    { id: "MiniMax-M2.5", label: "MiniMax M2.5", tier: AiModelTier.Balanced, recommended: true },
    { id: "MiniMax-M2.7", label: "MiniMax M2.7", tier: AiModelTier.Premium },
  ],
};

// All valid provider values (for CHECK constraint and validation)
export const PROVIDER_VALUES = Object.values(ProviderType);

// Provider-aware default model (returns balanced tier)
export function getDefaultModel(provider: ProviderType): string {
  const models = AI_MODELS[provider];
  const balanced = models.find((m) => m.recommended) ?? models.find((m) => m.tier === AiModelTier.Balanced);
  return balanced!.id;
}

// Validation helpers
export function isValidProvider(value: string): value is ProviderType {
  return PROVIDER_VALUES.includes(value as ProviderType);
}

export function isValidModel(provider: ProviderType, modelId: string): boolean {
  return AI_MODELS[provider].some((m) => m.id === modelId);
}
```

### 3.2 Subpath Export

Add to `packages/shared/package.json`:
```json
{
  "exports": {
    "./ai-models": "./src/ai-models.ts"
  }
}
```

### 3.3 Frontend Duplication

Following the existing pattern (`src/types/shared.ts`), duplicate the catalogue in `packages/frontend/src/types/ai-models.ts` as `const` objects (required by `erasableSyntaxOnly`):

```typescript
export const ProviderType = {
  Claude: "claude",
  OpenAI: "openai",
  Gemini: "gemini",
  Minimax: "minimax",
} as const;
export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

// ... same pattern for AiModelTier, PROVIDER_LABELS, AI_MODELS
```

Add corresponding entries to:
- `packages/frontend/tsconfig.app.json` paths: `"@bonplan/shared/ai-models": ["./src/types/ai-models.ts"]`
- `packages/frontend/vite.config.ts` alias: `"@bonplan/shared/ai-models": resolve(__dirname, "src/types/ai-models.ts")`

Add a build-time equality test at `packages/frontend/src/types/ai-models.test.ts` using `bun test`:
```typescript
import { AI_MODELS as shared } from "@bonplan/shared/ai-models"; // real import
import { AI_MODELS as local } from "./ai-models"; // local copy
expect(JSON.stringify(local)).toBe(JSON.stringify(shared));
```

---

## 4. Schema Changes

### 4.1 Users Table — New Columns

```sql
ALTER TABLE users ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE users ADD COLUMN ai_model TEXT;
```

**No pgEnum** — `ALTER TYPE ... ADD VALUE` cannot run inside a Drizzle transaction. Use TEXT with a CHECK constraint for DB-level safety:

Drizzle schema addition:
```typescript
aiProvider: text("ai_provider").notNull().default("claude"),
aiModel: text("ai_model"),
```

Add table-level CHECK constraint:
```typescript
check("ai_provider_valid", sql`${table.aiProvider} IN ('claude', 'openai', 'gemini', 'minimax')`)
```

This CHECK constraint is transaction-safe (unlike pgEnum) and easy to ALTER when adding a 5th provider.

**Migration safety:** Existing users with a Claude key get `ai_provider = "claude"`, `ai_model = null` (null = balanced default). No data loss. Run via `bun run db:generate && bun run db:migrate`.

### 4.2 Analyses Table — New Column

```sql
ALTER TABLE analyses ADD COLUMN provider_used TEXT;
```

Drizzle schema:
```typescript
providerUsed: text("provider_used"),
```

Nullable for backward compatibility with existing analyses. New analyses always populate both `modelUsed` and `providerUsed`.

---

## 5. Gateway Changes

### 5.1 `GET /api/settings` Response

Add to response:
```typescript
{
  // ...existing fields...
  aiProvider: string;       // "claude" | "openai" | "gemini" | "minimax"
  aiModel: string | null;   // null = provider default
}
```

**Update `maskedApiKey`:** Replace the hardcoded `"sk-ant-...****"` mask with a generic mask: show first 6 characters + `"...****"` regardless of provider. This handles Claude (`sk-ant-...`), OpenAI (`sk-proj-...`), Gemini, and Minimax keys correctly.

**When `hasApiKey` is false:** Return `aiProvider` and `aiModel` as stored, but the frontend uses `hasApiKey` to determine if configuration is complete.

### 5.2 `PATCH /api/settings` — Combined Schema with Conditional Validation

Single endpoint, single Zod schema with `.refine()`:

```typescript
export const updateSettingsSchema = z.object({
  aiProvider: z.enum(["claude", "openai", "gemini", "minimax"]).optional(),
  aiModel: z.string().optional(),
  aiApiKey: z.string().trim().min(1).max(500).optional(),
  currentPassword: z.string().min(1).optional(),
}).refine(
  (d) => !d.aiApiKey || d.currentPassword,
  { message: "Password required to change API key", path: ["currentPassword"] }
);
```

**Validation rules in the route handler:**
1. If `aiModel` provided: validate against `AI_MODELS[targetProvider]` where `targetProvider` = `aiProvider` (if present) or current DB value
2. If `aiProvider` changed and no `aiApiKey` provided: reject with 400 ("New provider requires a new API key")
3. If `aiProvider` changed and no `aiModel` provided: force `ai_model = null` (server-side invariant — prevents stale model from wrong provider)
4. If `aiApiKey` provided without `currentPassword`: rejected by Zod refine above
5. All updates in a single `db.update()` call (atomic), including `updatedAt: new Date()`

### 5.3 Frontend Types to Update

- `SettingsResponse` in `packages/frontend/src/hooks/queries.ts`: add `aiProvider` and `aiModel` fields
- `useUpdateSettings` mutation in `packages/frontend/src/hooks/mutations.ts`: make `currentPassword` optional

---

## 6. Analyzer & Orchestrator Migration

### 6.1 Dependency Change

Before:
```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey, maxRetries: 2 });
const res = await client.messages.create({ model, system, messages, max_tokens });
const text = res.content[0].text;
```

After:
```typescript
import { getProvider, AiAuthError, AiQuotaError, AiRateLimitError } from "@bonplan/ai";
import { getDefaultModel } from "@bonplan/shared/ai-models";

const provider = getProvider(userProvider);
const { text, usage } = await provider.chat({
  apiKey: decryptedKey,
  model: userModel ?? getDefaultModel(userProvider),
  systemPrompt,
  userPrompt,
  maxTokens: 2048,
  responseFormat: "json",
});
```

### 6.2 DB Select Widening

**Both packages** have DB selects that must include the new columns:

**Analyzer** — `packages/analyzer/src/analyze.ts` ~line 210:
```typescript
// Before:
.select({ aiApiKeyEncrypted: users.aiApiKeyEncrypted, aiApiKeyVersion: users.aiApiKeyVersion })
// After:
.select({
  aiApiKeyEncrypted: users.aiApiKeyEncrypted,
  aiApiKeyVersion: users.aiApiKeyVersion,
  aiProvider: users.aiProvider,
  aiModel: users.aiModel,
})
```

**Orchestrator** — `packages/orchestrator/src/consumers.ts` ~line 82:
```typescript
// Before:
.select({ aiApiKeyEncrypted: users.aiApiKeyEncrypted, aiApiKeyVersion: users.aiApiKeyVersion })
// After:
.select({
  aiApiKeyEncrypted: users.aiApiKeyEncrypted,
  aiApiKeyVersion: users.aiApiKeyVersion,
  aiProvider: users.aiProvider,
  aiModel: users.aiModel,
})
```

### 6.3 Error Handling Migration

**Analyzer** (`analyze.ts` ~line 257):
```typescript
// Before:
const isAuthError = err instanceof Anthropic.AuthenticationError ||
  ("status" in err && err.status === 401);
// After:
if (err instanceof AiAuthError || err instanceof AiQuotaError) {
  // publish SearchError(invalid_api_key), stop batch
}
if (err instanceof AiRateLimitError) {
  // log warning, skip listing, continue batch
}
```

**Orchestrator** — `packages/orchestrator/src/consumers.ts` ~line 126 (NOT ai-mapper.ts):
```typescript
// Before: dynamic import
const Anthropic = (await import("@anthropic-ai/sdk")).default;
if (err instanceof Anthropic.AuthenticationError || err.status === 401) ...
// After:
if (err instanceof AiAuthError || err instanceof AiQuotaError) ...
```

### 6.4 Orchestrator Signature Change

`mapSearchToLbcParams()` in `ai-mapper.ts`: add `provider` and `model` params:
```typescript
// Before:
export async function mapSearchToLbcParams(query, location, radiusKm, apiKey)
// After:
export async function mapSearchToLbcParams(query, location, radiusKm, apiKey, provider: ProviderType, model: string | null)
```

Call site in `consumers.ts` ~line 121 passes the new params from the widened DB select.

### 6.5 Analysis Record — Store Provider

In the upsert at `analyze.ts` ~line 136 (success) and ~line 98 (failure), add:
```typescript
providerUsed: userProvider,
```

### 6.6 Model Fallback Chain

1. User's explicit `ai_model` from DB
2. `getDefaultModel(provider)` — returns the balanced tier model for that provider
3. Remove `process.env.ANTHROPIC_MODEL` fallback entirely
4. Update startup log in `analyzer/src/index.ts` ~line 20 to remove ANTHROPIC_MODEL reference

### 6.7 JSON Parsing Robustness

The existing 3-strategy JSON parsing (direct parse, code-block extraction, bare object extraction) in both `scoring.ts` and `ai-mapper.ts` is retained. Add a **pre-parse repair step** applied before each strategy:
- Strip trailing commas before `}` and `]`
- Strip any text before the first `{` and after the last `}`

This is a simple regex, not a 4th sequential strategy. Apply it in both files (or extract to a shared `parseJsonResponse()` utility in `@bonplan/ai`).

### 6.8 Cosmetic Updates

- `market-research.ts` ~line 49: change comment from "for Claude" to "for AI analysis"
- `analyzer/src/index.ts` ~line 20: update startup log to show provider info instead of ANTHROPIC_MODEL

---

## 7. Frontend Settings UI

### 7.1 Prerequisites

- **Add shadcn/ui `<Select>` component** — does not exist in the codebase yet. Run `npx shadcn@latest add select` or manually add.

### 7.2 Rename "Cle API" Tab to "Configuration IA"

Replace the existing `ApiKeyTab` content with the new combined section. Update hardcoded strings:
- `ApiKeyBanner.tsx`: change "Cle API Claude" / "cle API Anthropic" to provider-agnostic text (e.g., "Cle API IA", dynamically show provider name)
- `SettingsPage.tsx`: change "Cle API Claude" tab title to "Configuration IA"

### 7.3 New "Configuration IA" Section

1. **Provider Dropdown** — `<Select>` with 4 options, labels from `PROVIDER_LABELS`
2. **Model Dropdown** — Filtered by selected provider, grouped by tier (`<SelectGroup>` with labels "Rapide / Equilibre / Premium"), balanced model marked "(Recommande)"
3. **API Key Input** — Password field:
   - Hidden if user has a saved key AND hasn't changed provider
   - Shown with message "Vous changez de fournisseur. Une nouvelle cle API est requise." when provider changes
   - Not auto-cleared on provider switch (preserves user input)
4. **Save Button** — Calls `PATCH /api/settings`. If `aiApiKey` is included, prompts for password first.

### 7.4 Behavior

- Provider change → model dropdown resets to balanced default, API key field shown
- Model change (same provider) → no key required, save directly
- Provider switch back to saved provider → key field hidden again, masked key shown

### 7.5 Form State Management

Initialize form state from `useSettings()` query data. Gate the form render on `!isLoading` to avoid uncontrolled-to-controlled issues:
```typescript
const { data } = useSettings();
const savedProvider = data?.data?.aiProvider;
// Only render form when data is loaded
if (!data) return <Skeleton />;
```

Track `selectedProvider` in state, compare to `savedProvider` to determine if provider changed.

### 7.6 Mutation Hooks

Keep a single `useUpdateSettings` hook but update the type to accept optional fields:
```typescript
mutationFn: (data: {
  aiProvider?: string;
  aiModel?: string;
  aiApiKey?: string;
  currentPassword?: string;
}) => api("/api/settings", { method: "PATCH", body: data })
```

Add `onError` handler showing a toast for failed updates.

### 7.7 ApiKeyBanner Extension

Update `ApiKeyBannerProps` to include `aiProvider`:
```typescript
type ApiKeyBannerProps = { hasApiKey: boolean; aiProvider?: string };
```

Display provider-aware text: "Configurez votre cle API {providerLabel} pour commencer." If no API key is set, block search creation with a message directing to settings.

### 7.8 Import Strategy

`AI_MODELS` and `ProviderType` duplicated in `packages/frontend/src/types/ai-models.ts` as `const` objects. Add path entries:
- `tsconfig.app.json` paths: `"@bonplan/shared/ai-models": ["./src/types/ai-models.ts"]`
- `vite.config.ts` alias: `"@bonplan/shared/ai-models": resolve(__dirname, "src/types/ai-models.ts")`

Build-time equality test at `packages/frontend/src/types/ai-models.test.ts` (runs with `bun test`).

---

## 8. Error Handling Summary

| Error | Provider Behavior | App Behavior |
|-------|-------------------|--------------|
| Auth (401/403) | `AiAuthError` | Publish `SearchError(invalid_api_key)`, stop batch, log security |
| Quota exhausted (402) | `AiQuotaError` | Publish `SearchError(quota_exhausted)`, stop batch, distinct user message |
| Rate limit (429) | `AiRateLimitError` | Log warning, skip listing, continue batch |
| Context too long (400) | Provider-specific | Log, store analysis with `score: null`, continue |
| Parse failure | N/A (app-level) | Store analysis with `score: null, verdict: "Analysis failed"` |

**No automatic fallback between providers.** Errors are surfaced to the user.

---

## 9. Testing Strategy

### 9.1 Unit Tests (`@bonplan/ai`)

- Mock each SDK, test that `chat()` returns `{ text, usage }` correctly
- Test error normalization: mock 401 → `AiAuthError`, 402 → `AiQuotaError`, 429 → `AiRateLimitError`
- Test JSON mode: verify native mode is enabled for OpenAI/Gemini/Minimax, instruction kept for Claude
- Test `getProvider()` returns correct implementation per type

### 9.2 Unit Tests (`@bonplan/shared`)

- `getDefaultModel()` returns balanced model for each provider
- `isValidProvider()` and `isValidModel()` validation
- Catalogue completeness: every provider has exactly 3 tiers

### 9.3 Integration Tests (Gateway)

- `PATCH /api/settings` with provider + model only → succeeds without password
- `PATCH /api/settings` with apiKey but no password → 400
- `PATCH /api/settings` with provider change but no apiKey → 400
- `PATCH /api/settings` with provider change → forces `ai_model = null`
- `GET /api/settings` returns new fields

### 9.4 Build-Time Test (Frontend)

- `ai-models.test.ts`: assert local catalogue equals shared package catalogue

### 9.5 Migration Test

- Verify existing users get `ai_provider = "claude"`, `ai_model = null` after migration

---

## 10. Rollback Plan

- The migration adds columns with defaults — rollback migration can drop them safely
- If a user already switched to OpenAI and we roll back: their `ai_api_key_encrypted` contains an OpenAI key. Dropping `ai_provider` column means the code falls back to Claude, but the stored key is for OpenAI → auth errors. **Mitigation:** before rolling back, identify affected users (any with `ai_provider != 'claude'`) and notify them to re-enter their Claude key.
- The `@bonplan/ai` package can be removed from dependencies and replaced with direct Anthropic SDK imports (reverting to the current code). No permanent damage.
- **No feature flag** — the migration is atomic. If issues arise, revert the code and run the down migration.

---

## 11. What's NOT In Scope

- Storing multiple keys per user (one provider at a time)
- Live API key validation on save (format-level checks like `sk-` prefix are acceptable)
- Automatic provider fallback on error
- Custom/self-hosted provider support (e.g., Ollama, vLLM)
- Token cost tracking or billing dashboard
- Per-provider prompt tuning (same prompts for all, only JSON mode differs)
- Streaming responses
- Rate limit retry with exponential backoff (skip and continue for v1)
- Model deprecation handling (manual catalogue update when models retire)
- Lazy SDK loading (all 3 SDKs loaded at startup)
- Provider health checks / status page

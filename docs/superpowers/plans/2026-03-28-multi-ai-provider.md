# Multi-AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support for Claude, OpenAI, Gemini, and Minimax AI providers so each user can choose their preferred provider and model.

**Architecture:** New `@bonplan/ai` package with a provider interface + 4 implementations (3 SDKs — Minimax reuses OpenAI). Each provider's `chat()` creates a fresh SDK client per call with the user's API key. Enums and model catalogue live in `@bonplan/shared/ai-models`. Analyzer and orchestrator migrate from direct Anthropic imports to the abstraction.

**Tech Stack:** Bun, TypeScript, Drizzle ORM, Hono, React 19, TanStack Query v5, shadcn/ui, `@anthropic-ai/sdk`, `openai`, `@google/genai`

**Spec:** `docs/superpowers/specs/2026-03-28-multi-ai-provider-design.md`

---

### Task 1: Shared — AI Models Catalogue & Validation Helpers

**Files:**
- Create: `packages/shared/src/ai-models.ts`
- Modify: `packages/shared/package.json`
- Create: `packages/shared/src/ai-models.test.ts`

- [ ] **Step 1: Write test for catalogue and helpers**

Create `packages/shared/src/ai-models.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  AI_MODELS,
  AiModelTier,
  PROVIDER_LABELS,
  PROVIDER_VALUES,
  ProviderType,
  getDefaultModel,
  isValidModel,
  isValidProvider,
} from "./ai-models";

describe("ProviderType", () => {
  test("has exactly 4 providers", () => {
    expect(PROVIDER_VALUES).toHaveLength(4);
  });

  test("values match expected strings", () => {
    expect(ProviderType.Claude).toBe("claude");
    expect(ProviderType.OpenAI).toBe("openai");
    expect(ProviderType.Gemini).toBe("gemini");
    expect(ProviderType.Minimax).toBe("minimax");
  });
});

describe("AI_MODELS", () => {
  test("every provider has exactly 3 models", () => {
    for (const provider of PROVIDER_VALUES) {
      expect(AI_MODELS[provider as ProviderType]).toHaveLength(3);
    }
  });

  test("every provider has one model per tier", () => {
    for (const provider of PROVIDER_VALUES) {
      const tiers = AI_MODELS[provider as ProviderType].map((m) => m.tier);
      expect(tiers).toContain(AiModelTier.Fast);
      expect(tiers).toContain(AiModelTier.Balanced);
      expect(tiers).toContain(AiModelTier.Premium);
    }
  });

  test("every provider has exactly one recommended model", () => {
    for (const provider of PROVIDER_VALUES) {
      const recommended = AI_MODELS[provider as ProviderType].filter((m) => m.recommended);
      expect(recommended).toHaveLength(1);
    }
  });
});

describe("PROVIDER_LABELS", () => {
  test("has a label for every provider", () => {
    for (const provider of PROVIDER_VALUES) {
      expect(PROVIDER_LABELS[provider as ProviderType]).toBeDefined();
      expect(typeof PROVIDER_LABELS[provider as ProviderType]).toBe("string");
    }
  });
});

describe("getDefaultModel", () => {
  test("returns balanced model for each provider", () => {
    expect(getDefaultModel(ProviderType.Claude)).toBe("claude-sonnet-4-6");
    expect(getDefaultModel(ProviderType.OpenAI)).toBe("gpt-5.4-mini");
    expect(getDefaultModel(ProviderType.Gemini)).toBe("gemini-3-flash");
    expect(getDefaultModel(ProviderType.Minimax)).toBe("MiniMax-M2.5");
  });
});

describe("isValidProvider", () => {
  test("accepts valid providers", () => {
    expect(isValidProvider("claude")).toBe(true);
    expect(isValidProvider("openai")).toBe(true);
    expect(isValidProvider("gemini")).toBe(true);
    expect(isValidProvider("minimax")).toBe(true);
  });

  test("rejects invalid providers", () => {
    expect(isValidProvider("invalid")).toBe(false);
    expect(isValidProvider("")).toBe(false);
    expect(isValidProvider("Claude")).toBe(false);
  });
});

describe("isValidModel", () => {
  test("accepts valid model for provider", () => {
    expect(isValidModel(ProviderType.Claude, "claude-sonnet-4-6")).toBe(true);
    expect(isValidModel(ProviderType.Minimax, "MiniMax-M2.7")).toBe(true);
  });

  test("rejects model from wrong provider", () => {
    expect(isValidModel(ProviderType.Claude, "gpt-5.4")).toBe(false);
    expect(isValidModel(ProviderType.OpenAI, "claude-sonnet-4-6")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun test packages/shared/src/ai-models.test.ts`
Expected: FAIL — module `./ai-models` not found

- [ ] **Step 3: Implement the catalogue**

Create `packages/shared/src/ai-models.ts` with the full catalogue (enums, AI_MODELS, PROVIDER_LABELS, helpers). See spec Section 3.1 for the complete code.

- [ ] **Step 4: Add subpath export to shared package.json**

In `packages/shared/package.json`, add to the `exports` field:

```json
"exports": {
  ".": "./src/index.ts",
  "./types": "./src/types.ts",
  "./ai-models": "./src/ai-models.ts"
}
```

**Do NOT** add `export * from "./ai-models"` to `index.ts` — the subpath export keeps AI enums separate from the Drizzle barrel to avoid conflicts.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun test packages/shared/src/ai-models.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ai-models.ts packages/shared/src/ai-models.test.ts packages/shared/package.json
git commit -m "feat(shared): add AI provider catalogue and validation helpers"
```

---

### Task 2: Shared — Schema Migration (Users + Analyses)

**Files:**
- Modify: `packages/shared/src/schema.ts:23-34` (users table), `packages/shared/src/schema.ts:143-174` (analyses table)

- [ ] **Step 1: Add columns and CHECK constraint to users table**

The current `users` table (lines 23-34) has NO third argument (no constraint callback). Rewrite the full table definition to add the new columns and CHECK:

```typescript
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull().default(""),
    displayName: text("display_name"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    aiApiKeyEncrypted: text("ai_api_key_encrypted"),
    aiApiKeyVersion: integer("ai_api_key_version"),
    aiProvider: text("ai_provider").notNull().default("claude"),
    aiModel: text("ai_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("ai_provider_valid", sql`${table.aiProvider} IN ('claude', 'openai', 'gemini', 'minimax')`),
  ],
);
```

- [ ] **Step 2: Add `providerUsed` column to analyses table**

In `packages/shared/src/schema.ts`, add to the `analyses` table after `modelUsed` (line 163):

```typescript
providerUsed: text("provider_used"),
```

- [ ] **Step 3: Generate and run migration**

```bash
cd /home/carlito/Projects/Labs/bonplan
bun run db:generate
bun run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts packages/shared/drizzle/
git commit -m "feat(shared): add ai_provider, ai_model, provider_used columns"
```

---

### Task 3: AI Package — Setup, Interface, Errors

**Files:**
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/provider.ts`
- Create: `packages/ai/src/index.ts`
- Create: `packages/ai/src/provider.test.ts`

- [ ] **Step 1: Create package scaffold**

Create `packages/ai/package.json`:

```json
{
  "name": "@bonplan/ai",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@bonplan/shared": "workspace:*",
    "@anthropic-ai/sdk": "^0.80.0",
    "openai": "^4.80.0",
    "@google/genai": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "@types/bun": "latest"
  }
}
```

Create `packages/ai/tsconfig.json` (extend base like all other packages):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun install`

- [ ] **Step 3: Write error class tests**

Create `packages/ai/src/provider.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "./provider";

describe("AiAuthError", () => {
  test("is an instance of Error", () => {
    const err = new AiAuthError("Invalid API key");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AiAuthError);
    expect(err.message).toBe("Invalid API key");
    expect(err.name).toBe("AiAuthError");
  });
});

describe("AiQuotaError", () => {
  test("is an instance of Error", () => {
    const err = new AiQuotaError("Quota exhausted");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AiQuotaError);
    expect(err.name).toBe("AiQuotaError");
  });
});

describe("AiRateLimitError", () => {
  test("stores retryAfterMs", () => {
    const err = new AiRateLimitError("Rate limited", 5000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AiRateLimitError);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.name).toBe("AiRateLimitError");
  });

  test("retryAfterMs is optional", () => {
    const err = new AiRateLimitError("Rate limited");
    expect(err.retryAfterMs).toBeUndefined();
  });
});
```

- [ ] **Step 4: Implement interface and error classes**

Create `packages/ai/src/provider.ts`:

```typescript
export interface ChatParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface ChatResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  chat(params: ChatParams): Promise<ChatResult>;
}

export class AiAuthError extends Error {
  override name = "AiAuthError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class AiQuotaError extends Error {
  override name = "AiQuotaError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class AiRateLimitError extends Error {
  override name = "AiRateLimitError";
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.retryAfterMs = retryAfterMs;
  }
}
```

- [ ] **Step 5: Create initial public exports**

Create `packages/ai/src/index.ts`:

```typescript
export type { AiProvider, ChatParams, ChatResult } from "./provider";
export { AiAuthError, AiQuotaError, AiRateLimitError } from "./provider";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun test packages/ai/src/provider.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ai/
git commit -m "feat(ai): add package scaffold, AiProvider interface, error classes"
```

---

### Task 4: AI Package — Claude Provider

**Files:**
- Create: `packages/ai/src/providers/claude.ts`
- Create: `packages/ai/src/providers/claude.test.ts`

- [ ] **Step 1: Write Claude provider test**

Create `packages/ai/src/providers/claude.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { AiAuthError, AiRateLimitError } from "../provider";
import { ClaudeProvider } from "./claude";

describe("ClaudeProvider", () => {
  test("implements chat() method", () => {
    const provider = new ClaudeProvider();
    expect(typeof provider.chat).toBe("function");
  });

  test("normalizeError maps 401 to AiAuthError", () => {
    const provider = new ClaudeProvider();
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    expect(provider.normalizeError(err)).toBeInstanceOf(AiAuthError);
  });

  test("normalizeError maps 403 to AiAuthError", () => {
    const provider = new ClaudeProvider();
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    expect(provider.normalizeError(err)).toBeInstanceOf(AiAuthError);
  });

  test("normalizeError maps 429 to AiRateLimitError", () => {
    const provider = new ClaudeProvider();
    const err = Object.assign(new Error("Rate limited"), { status: 429 });
    expect(provider.normalizeError(err)).toBeInstanceOf(AiRateLimitError);
  });

  test("normalizeError passes through unknown errors", () => {
    const provider = new ClaudeProvider();
    const err = new Error("Something else");
    expect(provider.normalizeError(err)).toBe(err);
  });
});
```

- [ ] **Step 2: Implement Claude provider**

Create `packages/ai/src/providers/claude.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, ChatParams, ChatResult } from "../provider";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "../provider";

export class ClaudeProvider implements AiProvider {
  async chat(params: ChatParams): Promise<ChatResult> {
    const client = new Anthropic({ apiKey: params.apiKey, maxRetries: 2 });

    try {
      const res = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      });

      const textBlock = res.content.find((b) => b.type === "text");
      return {
        text: textBlock?.text ?? "",
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      };
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  normalizeError(err: unknown): unknown {
    if (err instanceof Anthropic.AuthenticationError) return new AiAuthError(err.message, { cause: err });
    if (err instanceof Anthropic.PermissionDeniedError) return new AiAuthError(err.message, { cause: err });
    if (err instanceof Anthropic.RateLimitError) {
      const retryAfter = (err as { headers?: Headers }).headers?.get?.("retry-after");
      return new AiRateLimitError(err.message, retryAfter ? Number(retryAfter) * 1000 : undefined, { cause: err });
    }

    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return new AiAuthError((err as Error).message, { cause: err });
    if (status === 402) return new AiQuotaError((err as Error).message, { cause: err });
    if (status === 429) {
      const headers = (err as { headers?: Headers }).headers;
      const retryAfter = headers?.get?.("retry-after");
      return new AiRateLimitError((err as Error).message, retryAfter ? Number(retryAfter) * 1000 : undefined, { cause: err });
    }
    return err;
  }
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
cd /home/carlito/Projects/Labs/bonplan && bun test packages/ai/src/providers/claude.test.ts
git add packages/ai/src/providers/claude.ts packages/ai/src/providers/claude.test.ts
git commit -m "feat(ai): add Claude provider implementation"
```

---

### Task 5: AI Package — OpenAI, Gemini, Minimax Providers

**Files:**
- Create: `packages/ai/src/providers/openai.ts`
- Create: `packages/ai/src/providers/gemini.ts`
- Create: `packages/ai/src/providers/minimax.ts`
- Create: `packages/ai/src/providers/openai.test.ts`
- Create: `packages/ai/src/providers/gemini.test.ts`
- Create: `packages/ai/src/providers/minimax.test.ts`

- [ ] **Step 1: Implement OpenAI provider**

Create `packages/ai/src/providers/openai.ts`:

```typescript
import OpenAI from "openai";
import type { AiProvider, ChatParams, ChatResult } from "../provider";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "../provider";

export class OpenAIProvider implements AiProvider {
  protected baseURL?: string;

  async chat(params: ChatParams): Promise<ChatResult> {
    const client = new OpenAI({
      apiKey: params.apiKey,
      maxRetries: 2,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    });

    try {
      const res = await client.chat.completions.create({
        model: params.model,
        max_completion_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        ...(params.responseFormat === "json" ? { response_format: { type: "json_object" as const } } : {}),
      });

      return {
        text: res.choices[0]?.message?.content ?? "",
        usage: res.usage
          ? { inputTokens: res.usage.prompt_tokens, outputTokens: res.usage.completion_tokens ?? 0 }
          : undefined,
      };
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  normalizeError(err: unknown): unknown {
    if (err instanceof OpenAI.AuthenticationError) return new AiAuthError(err.message, { cause: err });

    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return new AiAuthError((err as Error).message, { cause: err });
    if (status === 402) return new AiQuotaError((err as Error).message, { cause: err });
    if (status === 429) {
      const headers = (err as { headers?: Headers }).headers;
      const retryAfter = headers?.get?.("retry-after");
      return new AiRateLimitError((err as Error).message, retryAfter ? Number(retryAfter) * 1000 : undefined, { cause: err });
    }
    return err;
  }
}
```

- [ ] **Step 2: Implement Gemini provider**

Create `packages/ai/src/providers/gemini.ts`:

```typescript
import { GoogleGenAI } from "@google/genai";
import type { AiProvider, ChatParams, ChatResult } from "../provider";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "../provider";

export class GeminiProvider implements AiProvider {
  async chat(params: ChatParams): Promise<ChatResult> {
    const client = new GoogleGenAI({ apiKey: params.apiKey });

    const config: Record<string, unknown> = {
      maxOutputTokens: params.maxTokens,
      temperature: params.temperature,
    };
    if (params.responseFormat === "json") {
      config.responseMimeType = "application/json";
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await client.models.generateContent({
          model: params.model,
          config: { ...config, systemInstruction: params.systemPrompt },
          contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
        });

        return {
          text: res.text ?? "",
          usage: res.usageMetadata
            ? { inputTokens: res.usageMetadata.promptTokenCount ?? 0, outputTokens: res.usageMetadata.candidatesTokenCount ?? 0 }
            : undefined,
        };
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number }).status;
        if (status === 429 || status === 500) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw this.normalizeError(err);
      }
    }
    throw this.normalizeError(lastErr);
  }

  normalizeError(err: unknown): unknown {
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? String(err);
    if (status === 401 || status === 403) return new AiAuthError(message, { cause: err });
    if (status === 402) return new AiQuotaError(message, { cause: err });
    if (status === 429) return new AiRateLimitError(message, undefined, { cause: err });
    // Google SDK errors often use string-based error codes
    if (message.includes("PERMISSION_DENIED") || message.includes("API_KEY_INVALID"))
      return new AiAuthError(message, { cause: err });
    if (message.includes("RESOURCE_EXHAUSTED"))
      return new AiRateLimitError(message, undefined, { cause: err });
    return err;
  }
}
```

- [ ] **Step 3: Implement Minimax provider (extends OpenAI)**

Create `packages/ai/src/providers/minimax.ts`:

```typescript
import { OpenAIProvider } from "./openai";

export class MinimaxProvider extends OpenAIProvider {
  override baseURL = "https://api.minimax.io/v1";
}
```

- [ ] **Step 4: Write tests for all three**

Create `packages/ai/src/providers/openai.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { AiAuthError, AiQuotaError, AiRateLimitError } from "../provider";
import { OpenAIProvider } from "./openai";

describe("OpenAIProvider", () => {
  test("implements chat() method", () => {
    expect(typeof new OpenAIProvider().chat).toBe("function");
  });
  test("normalizeError maps 401 to AiAuthError", () => {
    expect(new OpenAIProvider().normalizeError(Object.assign(new Error(""), { status: 401 }))).toBeInstanceOf(AiAuthError);
  });
  test("normalizeError maps 402 to AiQuotaError", () => {
    expect(new OpenAIProvider().normalizeError(Object.assign(new Error(""), { status: 402 }))).toBeInstanceOf(AiQuotaError);
  });
  test("normalizeError maps 429 to AiRateLimitError", () => {
    expect(new OpenAIProvider().normalizeError(Object.assign(new Error(""), { status: 429 }))).toBeInstanceOf(AiRateLimitError);
  });
  test("normalizeError passes through unknown errors", () => {
    const err = new Error("x");
    expect(new OpenAIProvider().normalizeError(err)).toBe(err);
  });
});
```

Create `packages/ai/src/providers/gemini.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { AiAuthError, AiRateLimitError } from "../provider";
import { GeminiProvider } from "./gemini";

describe("GeminiProvider", () => {
  test("implements chat() method", () => {
    expect(typeof new GeminiProvider().chat).toBe("function");
  });
  test("normalizeError maps 403 to AiAuthError", () => {
    expect(new GeminiProvider().normalizeError(Object.assign(new Error(""), { status: 403 }))).toBeInstanceOf(AiAuthError);
  });
  test("normalizeError maps PERMISSION_DENIED to AiAuthError", () => {
    expect(new GeminiProvider().normalizeError(new Error("PERMISSION_DENIED"))).toBeInstanceOf(AiAuthError);
  });
  test("normalizeError maps RESOURCE_EXHAUSTED to AiRateLimitError", () => {
    expect(new GeminiProvider().normalizeError(new Error("RESOURCE_EXHAUSTED"))).toBeInstanceOf(AiRateLimitError);
  });
  test("normalizeError passes through unknown errors", () => {
    const err = new Error("x");
    expect(new GeminiProvider().normalizeError(err)).toBe(err);
  });
});
```

Create `packages/ai/src/providers/minimax.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { MinimaxProvider } from "./minimax";
import { OpenAIProvider } from "./openai";

describe("MinimaxProvider", () => {
  test("extends OpenAIProvider", () => {
    expect(new MinimaxProvider()).toBeInstanceOf(OpenAIProvider);
  });
  test("uses MiniMax base URL", () => {
    expect(new MinimaxProvider().baseURL).toBe("https://api.minimax.io/v1");
  });
});
```

Note: For Minimax test, `baseURL` must be `public` or `protected` on `OpenAIProvider`. Since the plan declares it as `protected`, either change to `public` or access via `(provider as any).baseURL`. Simplest: make `baseURL` a `public` field in `OpenAIProvider`.

- [ ] **Step 5: Run all provider tests, commit**

```bash
cd /home/carlito/Projects/Labs/bonplan && bun test packages/ai/src/providers/
git add packages/ai/src/providers/
git commit -m "feat(ai): add OpenAI, Gemini, Minimax provider implementations"
```

---

### Task 6: AI Package — Factory & Public Exports

**Files:**
- Create: `packages/ai/src/factory.ts`
- Create: `packages/ai/src/factory.test.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Implement factory**

Create `packages/ai/src/factory.ts`:

```typescript
import { ProviderType } from "@bonplan/shared/ai-models";
import type { AiProvider } from "./provider";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { MinimaxProvider } from "./providers/minimax";
import { OpenAIProvider } from "./providers/openai";

// Providers are stateless (fresh SDK client per chat() call), so singletons are safe
const providers: Record<ProviderType, AiProvider> = {
  [ProviderType.Claude]: new ClaudeProvider(),
  [ProviderType.OpenAI]: new OpenAIProvider(),
  [ProviderType.Gemini]: new GeminiProvider(),
  [ProviderType.Minimax]: new MinimaxProvider(),
};

export function getProvider(type: ProviderType): AiProvider {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown AI provider: ${type}`);
  return provider;
}
```

- [ ] **Step 2: Write factory test**

Create `packages/ai/src/factory.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { ProviderType } from "@bonplan/shared/ai-models";
import { getProvider } from "./factory";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { MinimaxProvider } from "./providers/minimax";
import { OpenAIProvider } from "./providers/openai";

describe("getProvider", () => {
  test("returns ClaudeProvider for claude", () => {
    expect(getProvider(ProviderType.Claude)).toBeInstanceOf(ClaudeProvider);
  });
  test("returns OpenAIProvider for openai", () => {
    expect(getProvider(ProviderType.OpenAI)).toBeInstanceOf(OpenAIProvider);
  });
  test("returns GeminiProvider for gemini", () => {
    expect(getProvider(ProviderType.Gemini)).toBeInstanceOf(GeminiProvider);
  });
  test("returns MinimaxProvider for minimax", () => {
    expect(getProvider(ProviderType.Minimax)).toBeInstanceOf(MinimaxProvider);
  });
  test("throws for unknown provider", () => {
    expect(() => getProvider("unknown" as ProviderType)).toThrow();
  });
});
```

- [ ] **Step 3: Update public exports**

Update `packages/ai/src/index.ts`:

```typescript
export type { AiProvider, ChatParams, ChatResult } from "./provider";
export { AiAuthError, AiQuotaError, AiRateLimitError } from "./provider";
export { getProvider } from "./factory";
```

- [ ] **Step 4: Run all AI package tests, commit**

```bash
cd /home/carlito/Projects/Labs/bonplan && bun test packages/ai/
git add packages/ai/
git commit -m "feat(ai): add provider factory and public exports"
```

---

### Task 7: Gateway — Settings Routes & Schema

**Files:**
- Modify: `packages/gateway/src/schemas.ts:54-57`
- Modify: `packages/gateway/src/routes/settings.ts`

- [ ] **Step 1: Update the Zod schema**

In `packages/gateway/src/schemas.ts`, replace `updateSettingsSchema` (lines 54-57) with:

```typescript
export const updateSettingsSchema = z.object({
  aiProvider: z.enum(["claude", "openai", "gemini", "minimax"]).optional(),
  aiModel: z.string().optional(),
  aiApiKey: z.string().trim().min(1).max(500).optional(),
  currentPassword: z.string().min(1).optional(),
}).refine(
  (d) => !d.aiApiKey || d.currentPassword,
  { message: "Password required to change API key", path: ["currentPassword"] },
);
```

Note: `.refine()` changes the type from `ZodObject` to `ZodEffects`. If any code uses `.shape` on this schema, it will need updating.

- [ ] **Step 2: Update GET /api/settings**

In `packages/gateway/src/routes/settings.ts`, update the GET handler:

1. Add import at top: `import { isValidModel, type ProviderType } from "@bonplan/shared/ai-models";`

2. Widen DB select to include `aiProvider: users.aiProvider, aiModel: users.aiModel`

3. Update maskedApiKey to be generic (the encrypted value is base64, not the raw key — use a generic mask):
```typescript
const maskedApiKey = hasApiKey ? "••••••••••••" : null;
```

4. Add to response: `aiProvider: user.aiProvider, aiModel: user.aiModel ?? null`

- [ ] **Step 3: Rewrite PATCH /api/settings**

Replace the PATCH handler with the full implementation including all 5 validation rules. Key points:

1. After Zod validation, add no-op guard: `if (!aiProvider && aiModel === undefined && !aiApiKey) return c.json({ success: true });`

2. Fetch current user with `email`, `aiProvider`, `aiApiKeyEncrypted`

3. Validate: provider change requires new API key

4. Validate: model must belong to target provider using `isValidModel(targetProvider as ProviderType, aiModel)`

5. Password verification (when `aiApiKey` is provided) — use existing `auth.api.signInEmail` pattern from the current code

6. Build atomic update — force `aiModel = null` when provider changes without explicit model

7. Encrypt API key using correct signature: `encrypt(aiApiKey, config.encryptionKey, 1)` (NOT `encrypt(aiApiKey, keyMap)`)

8. Include `updatedAt: new Date()` in update

- [ ] **Step 4: Verify typecheck, commit**

```bash
cd /home/carlito/Projects/Labs/bonplan && bun run --filter @bonplan/gateway typecheck
git add packages/gateway/src/schemas.ts packages/gateway/src/routes/settings.ts
git commit -m "feat(gateway): update settings routes for multi-provider support"
```

---

### Task 8: Analyzer — Migrate to @bonplan/ai

**Files:**
- Modify: `packages/analyzer/package.json`
- Modify: `packages/analyzer/src/analyze.ts`
- Modify: `packages/analyzer/src/index.ts`
- Modify: `packages/analyzer/src/scoring.ts`
- Modify: `packages/analyzer/src/market-research.ts`

- [ ] **Step 1: Update dependencies**

In `packages/analyzer/package.json`: add `"@bonplan/ai": "workspace:*"`, remove `"@anthropic-ai/sdk"`.
Run: `bun install`

- [ ] **Step 2: Update imports in analyze.ts**

Replace the Anthropic import (line 2) with:
```typescript
import { type AiProvider, AiAuthError, AiQuotaError, AiRateLimitError, getProvider } from "@bonplan/ai";
import { type ProviderType, getDefaultModel } from "@bonplan/shared/ai-models";
```

- [ ] **Step 3: Refactor `analyzeListing` function signature**

The current signature (lines 30-40) takes `client: Anthropic` and `model: string`. Change to:

```typescript
const analyzeListing = async (
  deps: AnalyzeDeps,
  searchId: string,
  userId: string,
  listingId: string,
  searchQuery: string,
  aiContext: AiContext,
  provider: AiProvider,
  apiKey: string,
  userModel: string,
  userProvider: string,
  marketContext: string | null,
): Promise<void> => {
```

- [ ] **Step 4: Replace Claude API call inside analyzeListing**

Replace the `client.messages.create()` block (~lines 78-88) with:

```typescript
const { text: responseText } = await provider.chat({
  apiKey,
  model: userModel,
  systemPrompt: systemMessage,
  userPrompt: userMessage,
  maxTokens: 2048,
  responseFormat: "json",
});
```

Remove the `textBlock` extraction logic that follows — `responseText` is now directly available.

Update the `parseAnalysisResponse` call to use `responseText` directly.

- [ ] **Step 5: Update upserts to include providerUsed**

In both the success upsert (~line 136) and failure upsert (~line 98), add:
```typescript
providerUsed: userProvider,
modelUsed: userModel,
```

- [ ] **Step 6: Widen DB select and update call site**

In `startAnalysisConsumer` (~line 210), widen the select:
```typescript
.select({
  aiApiKeyEncrypted: users.aiApiKeyEncrypted,
  aiApiKeyVersion: users.aiApiKeyVersion,
  aiProvider: users.aiProvider,
  aiModel: users.aiModel,
})
```

Replace client creation (~line 242-244):
```typescript
const userProvider = (user.aiProvider ?? "claude") as ProviderType;
const userModel = user.aiModel ?? getDefaultModel(userProvider);
const provider = getProvider(userProvider);
```

Update the `analyzeListing` call site (~line 252) to pass the new params:
```typescript
await analyzeListing(deps, searchId, userId, listingId, searchQuery, aiContext, provider, apiKey, userModel, userProvider, marketContext);
```

- [ ] **Step 7: Update error handling**

Replace auth error detection (~line 257-270):

```typescript
if (err instanceof AiAuthError || err instanceof AiQuotaError) {
  const errorType = err instanceof AiQuotaError ? "quota_exhausted" : "invalid_api_key";
  logger.security("invalid_api_key_detected", { userId, searchId });
  await publish(deps.redis, Stream.SearchError, { searchId, userId, source: "analyzer", error: err.message, errorType });
  return;
}
if (err instanceof AiRateLimitError) {
  logger.warn("Rate limited, skipping listing", { listingId, retryAfterMs: err.retryAfterMs });
  continue;
}
```

Note: `publish` takes `deps.redis` as first argument (NOT just `publish(Stream.SearchError, ...)`).

- [ ] **Step 8: Add JSON pre-parse repair to scoring.ts**

In `packages/analyzer/src/scoring.ts`, add a `repairJson` helper and apply it in `parseAnalysisResponse`. **Keep the existing `ParseResult` return type** (`{ success: true, data } | { success: false, error }`) — do NOT change it to return `null`.

```typescript
function repairJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return text;
  let json = text.slice(start, end + 1);
  json = json.replace(/,\s*([}\]])/g, "$1");
  return json;
}
```

Apply `repairJson()` before each `tryParse()` call in the existing 3-strategy chain.

- [ ] **Step 9: Update startup log and cosmetic changes**

In `packages/analyzer/src/index.ts` (~line 18-21), remove `ANTHROPIC_MODEL` reference:
```typescript
logger.info("Analyzer running", { searxngUrl: config.searxngUrl ?? "disabled" });
```

In `packages/analyzer/src/market-research.ts` (~line 48), change comment from "for Claude" to "for AI analysis".

- [ ] **Step 10: Verify typecheck, commit**

```bash
cd /home/carlito/Projects/Labs/bonplan && bun run --filter @bonplan/analyzer typecheck
git add packages/analyzer/
git commit -m "feat(analyzer): migrate from Anthropic SDK to @bonplan/ai multi-provider"
```

---

### Task 9: Orchestrator — Migrate to @bonplan/ai

**Files:**
- Modify: `packages/orchestrator/package.json`
- Modify: `packages/orchestrator/src/ai-mapper.ts`
- Modify: `packages/orchestrator/src/consumers.ts`

- [ ] **Step 1: Update dependencies**

In `packages/orchestrator/package.json`: add `"@bonplan/ai": "workspace:*"`, remove `"@anthropic-ai/sdk"`.
Run: `bun install`

- [ ] **Step 2: Update ai-mapper.ts**

1. Replace Anthropic import with:
```typescript
import { getProvider } from "@bonplan/ai";
import { type ProviderType, getDefaultModel } from "@bonplan/shared/ai-models";
```

2. Update `mapSearchToLbcParams` signature to add `providerType: ProviderType, model: string | null`

3. Replace Claude API call with:
```typescript
const provider = getProvider(providerType);
const resolvedModel = model ?? getDefaultModel(providerType);
const { system, user } = buildMappingPrompt(query, location, radiusKm);

const { text: responseText } = await provider.chat({
  apiKey,
  model: resolvedModel,
  systemPrompt: system,
  userPrompt: user,
  maxTokens: 2048,
  responseFormat: "json",
});
```

4. Add same `repairJson` helper and apply it in `parseAiContextResponse`. **Keep the existing return type** — do not break it.

- [ ] **Step 3: Update consumers.ts**

1. Add imports:
```typescript
import { AiAuthError, AiQuotaError } from "@bonplan/ai";
import type { ProviderType } from "@bonplan/shared/ai-models";
```

2. Widen DB select (~line 82-87) to include `aiProvider: users.aiProvider, aiModel: users.aiModel`

3. Update `mapSearchToLbcParams` call (~line 121):
```typescript
aiContext = await mapSearchToLbcParams(
  search.query, search.location, search.radiusKm, apiKey,
  user.aiProvider as ProviderType, user.aiModel,
);
```

4. Replace error handling (~line 126-129) — remove dynamic `import("@anthropic-ai/sdk")`:
```typescript
const isAuthError = err instanceof AiAuthError || err instanceof AiQuotaError;
```

- [ ] **Step 4: Verify typecheck, commit**

```bash
cd /home/carlito/Projects/Labs/bonplan && bun run --filter @bonplan/orchestrator typecheck
git add packages/orchestrator/
git commit -m "feat(orchestrator): migrate from Anthropic SDK to @bonplan/ai multi-provider"
```

---

### Task 10: Frontend — Types, Imports, Select Component

**Files:**
- Create: `packages/frontend/src/types/ai-models.ts`
- Modify: `packages/frontend/tsconfig.app.json`
- Modify: `packages/frontend/vite.config.ts`
- Modify: `packages/frontend/src/hooks/queries.ts`
- Modify: `packages/frontend/src/hooks/mutations.ts`

- [ ] **Step 1: Create frontend AI models catalogue**

Create `packages/frontend/src/types/ai-models.ts` using `as const` pattern (required by `erasableSyntaxOnly`). See spec Section 3.3. Include: `ProviderType`, `AiModelTier`, `ModelOption`, `PROVIDER_LABELS`, `AI_MODELS`, `PROVIDER_VALUES`, `getDefaultModel`.

- [ ] **Step 2: Add path aliases**

In `packages/frontend/tsconfig.app.json` paths (~line 20-22), add:
```json
"@bonplan/shared/ai-models": ["./src/types/ai-models.ts"]
```

In `packages/frontend/vite.config.ts` resolve.alias (~line 8-12), add:
```typescript
"@bonplan/shared/ai-models": resolve(__dirname, "src/types/ai-models.ts"),
```

- [ ] **Step 3: Update SettingsResponse type**

In `packages/frontend/src/hooks/queries.ts`, add to `SettingsResponse` type:
```typescript
aiProvider: string;
aiModel: string | null;
```

- [ ] **Step 4: Update useUpdateSettings mutation**

In `packages/frontend/src/hooks/mutations.ts`, change `mutationFn` type to:
```typescript
mutationFn: (data: { aiProvider?: string; aiModel?: string; aiApiKey?: string; currentPassword?: string }) =>
```

- [ ] **Step 5: Add shadcn Select component**

Run: `cd /home/carlito/Projects/Labs/bonplan/packages/frontend && npx shadcn@latest add select`

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/types/ai-models.ts packages/frontend/tsconfig.app.json packages/frontend/vite.config.ts packages/frontend/src/hooks/ packages/frontend/src/components/ui/select.tsx
git commit -m "feat(frontend): add AI models catalogue, types, Select component"
```

---

### Task 11: Frontend — Settings Page "Configuration IA"

**Files:**
- Modify: `packages/frontend/src/routes/SettingsPage.tsx`
- Modify: `packages/frontend/src/components/ApiKeyBanner.tsx`
- Modify: `packages/frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Update imports in SettingsPage.tsx**

Replace the React import (line 2):
```typescript
// Before:
import { type FormEvent, useState } from "react";
// After:
import { useEffect, useRef, useState } from "react";
```

Add new imports at file level (NOT inside a component):
```typescript
import { AI_MODELS, type ProviderType, PROVIDER_LABELS, PROVIDER_VALUES, getDefaultModel } from "@bonplan/shared/ai-models";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
```

- [ ] **Step 2: Replace ApiKeyTab with AiConfigTab**

Replace the `ApiKeyTab` component (lines 16-113) with the new `AiConfigTab`. Key requirements:

1. Use `useRef` for initialization tracking (prevents background refetch from resetting form):
```typescript
const initializedRef = useRef(false);
useEffect(() => {
  if (settings && !initializedRef.current) {
    setSelectedProvider(settings.aiProvider);
    setSelectedModel(settings.aiModel ?? getDefaultModel(settings.aiProvider as ProviderType));
    initializedRef.current = true;
  }
}, [settings]);
```

2. Type the body correctly (NOT `Record<string, string>`):
```typescript
const body: { aiProvider?: string; aiModel?: string; aiApiKey?: string; currentPassword?: string } = {};
```

3. Enforce API key when provider changes:
```typescript
if (providerChanged && !apiKey) {
  setError("Une cle API est requise pour changer de fournisseur.");
  return;
}
```

4. After successful save, reset initializedRef to allow re-sync:
```typescript
initializedRef.current = false;
```

5. Import and use `ApiError` for structured error messages:
```typescript
import { ApiError } from "@/config/api";
// in catch:
if (err instanceof ApiError) setError(err.data?.error as string ?? err.message);
else setError("Erreur lors de la sauvegarde.");
```

- [ ] **Step 3: Update tab labels**

Change `<TabsTrigger value="api-key">` to `<TabsTrigger value="ai-config">Configuration IA</TabsTrigger>`.
Update `<TabsContent value="api-key">` to `<TabsContent value="ai-config">` and render `<AiConfigTab />`.

- [ ] **Step 4: Update ApiKeyBanner**

In `packages/frontend/src/components/ApiKeyBanner.tsx`:

```typescript
type ApiKeyBannerProps = { hasApiKey: boolean; aiProvider?: string };
```

Update text to be provider-agnostic: "Configurez votre fournisseur et cle API dans les parametres pour commencer."

- [ ] **Step 5: Update DashboardPage banner**

In `packages/frontend/src/routes/DashboardPage.tsx` (~line 43), use `.data` accessor:

```tsx
{settingsData?.data && !settingsData.data.hasApiKey && (
  <ApiKeyBanner hasApiKey={false} aiProvider={settingsData.data.aiProvider} />
)}
```

- [ ] **Step 6: Build and commit**

```bash
cd /home/carlito/Projects/Labs/bonplan/packages/frontend && bun run build
git add packages/frontend/src/
git commit -m "feat(frontend): add Configuration IA settings with provider/model selection"
```

---

### Task 12: Cleanup & Final Verification

- [ ] **Step 1: Remove dead code**

Check if `apiKeySchema` in `packages/frontend/src/forms/schemas.ts` is still used after removing `ApiKeyTab`. If unused, remove it.

- [ ] **Step 2: Run all typechecks**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun run typecheck`

- [ ] **Step 3: Run all tests**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun run test`

- [ ] **Step 4: Run biome check**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun run check`

- [ ] **Step 5: Build frontend**

Run: `cd /home/carlito/Projects/Labs/bonplan && bun run build`

- [ ] **Step 6: Manual smoke test**

1. `bun run dev`
2. Login at `http://localhost:5173`
3. Settings → Configuration IA → verify 4 providers, models filter by provider
4. Switch provider → verify API key field appears, model resets
5. Switch back → verify key field hidden
6. Save provider+model only → no password needed
7. Change provider with API key → password required

- [ ] **Step 7: Final commit if fixes needed**

```bash
git add -A && git commit -m "fix: resolve lint and typecheck issues from multi-provider migration"
```

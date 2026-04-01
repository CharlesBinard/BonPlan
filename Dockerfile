FROM oven/bun:1.3.9-alpine AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/gateway/package.json packages/gateway/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/scraper/package.json packages/scraper/
COPY packages/analyzer/package.json packages/analyzer/
COPY packages/notifier/package.json packages/notifier/
COPY packages/frontend/package.json packages/frontend/
RUN bun install --frozen-lockfile --production

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/

# ── Frontend build ──
FROM base AS frontend-build
COPY packages/frontend/ packages/frontend/
RUN cd packages/frontend && bun run build

# ── Gateway ──
FROM base AS gateway
COPY packages/gateway/ packages/gateway/
COPY --from=frontend-build /app/packages/frontend/dist packages/frontend/dist
EXPOSE 3000
CMD ["bun", "run", "packages/gateway/src/index.ts"]

# ── Orchestrator ──
FROM base AS orchestrator
COPY packages/orchestrator/ packages/orchestrator/
CMD ["bun", "run", "packages/orchestrator/src/index.ts"]

# ── Scraper (Node, not Bun — patchright requires Node) ──
FROM node:22-alpine AS scraper
WORKDIR /app
RUN npm install -g bun@1.3.9
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/scraper/package.json packages/scraper/
RUN bun install --frozen-lockfile --production
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY packages/scraper/ packages/scraper/
CMD ["node", "--import", "tsx", "packages/scraper/src/index.ts"]

# ── Analyzer ──
FROM base AS analyzer
COPY packages/analyzer/ packages/analyzer/
CMD ["bun", "run", "packages/analyzer/src/index.ts"]

# ── Notifier ──
FROM base AS notifier
COPY packages/notifier/ packages/notifier/
CMD ["bun", "run", "packages/notifier/src/index.ts"]

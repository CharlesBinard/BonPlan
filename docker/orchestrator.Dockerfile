FROM oven/bun:1.3.9-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/analyzer/package.json packages/analyzer/
COPY packages/frontend/package.json packages/frontend/
COPY packages/gateway/package.json packages/gateway/
COPY packages/notifier/package.json packages/notifier/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/scraper/package.json packages/scraper/
RUN bun install --frozen-lockfile

FROM deps AS final
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY packages/orchestrator/ packages/orchestrator/
CMD ["bun", "run", "packages/orchestrator/src/index.ts"]

FROM oven/bun:1.3.9-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/orchestrator/package.json packages/orchestrator/
RUN bun install --frozen-lockfile --production

FROM deps AS final
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY packages/orchestrator/ packages/orchestrator/
CMD ["bun", "run", "packages/orchestrator/src/index.ts"]

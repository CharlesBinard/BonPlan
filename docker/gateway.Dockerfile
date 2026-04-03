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
RUN bun install --frozen-lockfile && rm -rf /root/.bun/install/cache

FROM deps AS frontend-build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/
RUN cd packages/frontend && bun run build

FROM oven/bun:1.3.9-alpine AS final
WORKDIR /app
COPY --from=deps /app/node_modules node_modules/
COPY --from=deps /app/package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY packages/gateway/ packages/gateway/
COPY --from=frontend-build /app/packages/frontend/dist packages/frontend/dist
RUN adduser -D appuser
USER appuser
EXPOSE 3000
CMD ["bun", "run", "packages/gateway/src/index.ts"]

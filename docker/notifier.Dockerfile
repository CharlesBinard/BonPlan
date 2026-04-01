FROM oven/bun:1.3.9-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/notifier/package.json packages/notifier/
RUN bun install --frozen-lockfile --production

FROM deps AS final
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY packages/notifier/ packages/notifier/
CMD ["bun", "run", "packages/notifier/src/index.ts"]

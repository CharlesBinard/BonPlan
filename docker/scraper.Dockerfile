FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g bun@1.3.9
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/scraper/package.json packages/scraper/
RUN bun install --frozen-lockfile --production

FROM deps AS final
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY packages/scraper/ packages/scraper/
CMD ["node", "--import", "tsx", "packages/scraper/src/index.ts"]

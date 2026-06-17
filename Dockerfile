FROM node:24-bookworm-slim

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile \
  && pnpm exec playwright install --with-deps chromium \
  && pnpm store prune \
  && rm -rf /var/lib/apt/lists/*

COPY . .

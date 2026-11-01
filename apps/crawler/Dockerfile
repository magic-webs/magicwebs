# Build from the workspace root: docker build -f apps/crawler/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.64.1-noble

RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.0"
ENV PATH="/root/.bun/bin:${PATH}" \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/crawler ./apps/crawler
# Only the workspaces the crawler needs are copied; install just those.
RUN bun install --filter @magicwebs/crawler

USER pwuser
CMD ["bun", "apps/crawler/src/index.ts"]

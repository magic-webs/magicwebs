# Build from the workspace root: docker build -f apps/api/Dockerfile .
FROM oven/bun:1.4.0-slim

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# Only the workspaces the API needs are copied; install just those.
RUN bun install --filter @magicwebs/api --production

USER bun
EXPOSE 8787
CMD ["bun", "apps/api/src/index.ts"]

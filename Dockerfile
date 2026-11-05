# [Stage 1] Builder
FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# [Stage 2] Web Server
FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS web
WORKDIR /app
RUN apt-get update && apt-get install -y dumb-init --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]

# [Stage 3] Worker
FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS worker
WORKDIR /app

# Install Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    dumb-init \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

COPY --from=builder --chown=node:node /app /app

USER node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/worker.js"]

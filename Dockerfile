# --- build the web app
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- install server dependencies (build tools only needed if no prebuilt sqlite binary exists)
FROM node:22-bookworm-slim AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# --- runtime image
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/web/dist
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=web /app/web/dist /app/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]

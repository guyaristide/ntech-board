# NTECH Board : image unique (API + front), construite en trois étapes.

# 1. Construction du front (Vite) et du serveur (esbuild)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build

# 2. Dépendances de production du serveur uniquement
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @board/server --include-workspace-root=false

# 3. Image d'exécution, sans outils de construction, sous l'utilisateur « node » (uid 1000)
FROM node:22-alpine
RUN apk add --no-cache tini
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/app/storage \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/migrations ./apps/server/migrations
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/seeds ./seeds
# Le volume de stockage hérite de ces droits à sa création (imports, sauvegardes).
RUN mkdir -p /app/storage/imports /app/storage/backups && chown -R node:node /app/storage && chmod -R 750 /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]

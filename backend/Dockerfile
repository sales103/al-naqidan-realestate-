FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# -----------------------------------------------------------------------
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && cp -R node_modules /tmp/prod_node_modules
RUN npm ci

# -----------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# -----------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=deps /tmp/prod_node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/uploads /app/logs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]

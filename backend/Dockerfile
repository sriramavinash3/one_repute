# ============================================================
# STAGE 1: Builder
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies required for Prisma & Native build tools
RUN apk add --no-cache libc6-compat openssl python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Generate Prisma Client & compile TypeScript
RUN npx prisma generate
RUN npm run build

# ============================================================
# STAGE 2: Production Runtime
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl curl

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Copy compiled dist from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Create upload directory and set ownership to node user
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/src/main.js"]
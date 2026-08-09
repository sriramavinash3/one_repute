# ============================================================
# STAGE 1: Builder
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for Vite environment variables
# IMPORTANT: VITE_API_BASE_URL must be an EMPTY string (same-origin) or a bare
# host like "https://onerepute.com" — never "/api". App code always appends
# "/api/..." itself; a "/api" value here produces "/api/api/..." duplicates.
ARG VITE_API_BASE_URL=
ARG VITE_LOCAL_API_URL=http://backend:3000

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_LOCAL_API_URL=$VITE_LOCAL_API_URL

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ============================================================
# STAGE 2: Nginx Web Server
# ============================================================
FROM nginx:1.25-alpine AS runner

# Copy compiled static SPA files into standard Nginx web root
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
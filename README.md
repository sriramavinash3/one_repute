# OneRepute SaaS Platform — Production Architecture & Deployment Guide

OneRepute is an enterprise-grade AI Reputation Management platform built on NestJS, React (Vite), PostgreSQL, Redis, and Firebase.

---

## 🏗️ Production Architecture

```
Internet
   │
   ▼
Nginx Edge Reverse Proxy (Ports 80 / 443)
   │
   ├── /               ──► Frontend Container (React SPA served by internal Nginx)
   ├── /api            ──► Backend Container (NestJS API Port 3000)
   ├── /socket.io, /ws ──► Backend Container (WebSockets)
   │
   └── Private Network (onerepute_net)
        ├── PostgreSQL 16 (Port 5432)
        └── Redis 7 (Port 6379)
```

### Component Breakdown

1. **Nginx Edge Reverse Proxy**: Entry point for all inbound traffic. Handles SSL termination, rate limiting, gzip compression, and routes requests to internal containers.
2. **Frontend Container (`frontend`)**: Multi-stage build (`node:20-alpine` -> `nginx:1.25-alpine`). Serves compiled React single-page application with HTML5 history mode fallback (`try_files $uri $uri/ /index.html`).
3. **Backend Container (`backend`)**: NestJS application running on Node 20. Interacts with PostgreSQL, Redis, Firebase Admin SDK, and Google Business APIs.
4. **PostgreSQL Container (`postgres`)**: Relational database for persistent storage.
5. **Redis Container (`redis`)**: In-memory cache and BullMQ job queue manager for background automation & scheduled reviews sync.

---

## 🚀 One-Command Production Deployment

The entire VPS stack builds and runs cleanly inside Docker. Node.js or npm is **never** required on the host server.

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/onerepute/one_repute.git
cd one_repute

# Create production environment files
cp backend/.env.example backend/.env
```

### 2. Build & Launch Stack

```bash
# Build and start all 5 containers in background mode
docker compose up -d --build
```

### 3. Verify Container Health

```bash
docker compose ps
```

---

## 💻 Local Development Setup

For local feature development with hot reloading:

```bash
# 1. Start Infrastructure (Postgres + Redis)
docker compose up postgres redis -d

# 2. Start NestJS Backend Server
cd backend
npm install
npm run start:dev

# 3. Start React Frontend Dev Server (in another terminal)
cd frontend
npm install
npm run dev
```

---

## 🔄 Rebuild & Update Procedure

When pushing updates to production:

```bash
# Pull latest code
git pull origin main

# Rebuild and restart containers with zero downtime
docker compose up -d --build
```

---

## 🛠️ Troubleshooting & Diagnostics

### View Logs

```bash
# View all logs live
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
```

### Container Health Checks

```bash
# Check NestJS API health endpoint
curl http://localhost/api/health

# Check PostgreSQL readiness
docker exec -it onerepute_postgres pg_isready -U onerepute -d onerepute_db

# Check Redis connection
docker exec -it onerepute_redis redis-cli ping
```

---

## ⏪ Rollback Steps

To rollback to a previous release tag:

```bash
git checkout <previous-commit-or-tag>
docker compose up -d --build
```

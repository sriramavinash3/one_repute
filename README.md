# OneRepute SaaS Platform — Production HTTPS & Deployment Architecture

OneRepute is an enterprise-grade AI Reputation Management platform built on NestJS, React (Vite), PostgreSQL, Redis, Firebase, and Nginx.

---

## 🏗️ Production HTTPS Architecture

```
Internet (HTTP:80 / HTTPS:443)
       │
       ▼
Nginx Edge Reverse Proxy (Ports 80 & 443)
 ├── Port 80: ACME Challenge /.well-known/acme-challenge/ -> /var/www/certbot
 ├── Port 80: HTTP 301 Redirect -> https://onerepute.com$request_uri
 │
 └── Port 443 SSL HTTP/2 (TLS 1.2/1.3 + HSTS + OCSP Stapling)
      ├── /               ──► Frontend Container (React SPA)
      ├── /api/           ──► Backend Container (NestJS API Port 3000)
      ├── /health         ──► Backend Container (/api/health)
      └── /socket.io, /ws ──► Backend Container (WebSockets Upgrade)
```

---

## 🔒 SSL & Security Hardening Features

- **ACME Challenge Support**: Configured `/.well-known/acme-challenge/` mapped to `/var/www/certbot` for automatic Let's Encrypt renewal.
- **HTTP 301 Permanent Redirect**: Automatically upgrades all HTTP requests to HTTPS.
- **TLS 1.2 & TLS 1.3**: Modern SSL protocols enabled with strong ECDHE/AES-GCM cipher suites.
- **OCSP Stapling**: Configured `ssl_stapling on` and `ssl_stapling_verify on` with Google DNS resolvers (`8.8.8.8`).
- **HSTS (HTTP Strict Transport Security)**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Security Headers**: HSTS, CSP, Permissions-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection.

---

## 🚀 Let's Encrypt Certificate Issuance & Renewal

### 1. Initial Certificate Request (Host VPS)

```bash
# Obtain certificates using certbot webroot mode
sudo certbot certonly --webroot -w /var/lib/docker/volumes/one_repute_certbot_www/_data -d onerepute.com -d www.onerepute.com
```

### 2. Auto-Renewal Crontab Setup

Add the following to system `crontab` (`crontab -e`):

```bash
0 3 * * * certbot renew --quiet && docker exec onerepute_nginx nginx -s reload
```

---

## 🔄 Rebuild & Update Procedure

```bash
# Pull latest updates
git pull origin main

# Rebuild and start containers
docker compose up -d --build

# Verify Nginx configuration inside container
docker exec -it onerepute_nginx nginx -t
```

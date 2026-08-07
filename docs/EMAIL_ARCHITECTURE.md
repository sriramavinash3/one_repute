# OneRepute Transactional Email Architecture

## Overview
OneRepute's transactional email infrastructure is built using a modern, scalable, queue-driven architecture powered by **NestJS**, **BullMQ**, **Redis**, **Resend**, and **React Email**.

```
┌──────────────────────┐
│  Frontend / Web API  │
└──────────┬───────────┘
           │ HTTP / Controller Trigger
           ▼
┌──────────────────────┐
│     EmailService     │  ◄── DTO Validation
└──────────┬───────────┘
           │ Non-Blocking Enqueue
           ▼
┌──────────────────────┐
│    BullMQ Queue      │  ◄── Exponential Backoff & Retries
└──────────┬───────────┘
           │ Redis Connection
           ▼
┌──────────────────────┐
│     Redis Server     │  ◄── Persistent Queue & Lock Store
└──────────┬───────────┘
           │ Worker Consumer
           ▼
┌──────────────────────┐
│     Email Worker     │  ◄── React Email HTML Rendering
└──────────┬───────────┘
           │ Resend API Dispatch
           ▼
┌──────────────────────┐
│  Resend Email Engine │  ◄── Domain Verification (onerepute.com)
└──────────┬───────────┘
           │ SMTP / TLS Delivery
           ▼
┌──────────────────────┐
│      User Inbox      │  ◄── Dark Mode & Responsive Layout
└──────────────────────┘
```

---

## Key Components

### 1. NestJS Controllers & Auth Routes
- `POST /api/auth/onboard` — Automatically triggers `sendWelcomeEmail`, `sendVerificationEmail`, and `sendSubscriptionActivated` upon account registration.
- `POST /api/auth/forgot-password` — Generates cryptographically secure SHA-256 single-use tokens and dispatches `sendPasswordReset`.
- `POST /api/auth/reset-password` — Validates tokens against stored SHA-256 hashes, invalidates used tokens, updates credentials, and triggers `sendPasswordChanged` security alerts.
- `GET /api/email/metrics` — Exposes realtime queue and delivery metrics.

### 2. Email Service (`EmailService`)
- Provides strongly-typed functions for each email type:
  - `sendWelcomeEmail(dto)`
  - `sendVerificationEmail(dto)`
  - `sendPasswordReset(dto)`
  - `sendPasswordChanged(dto)`
  - `sendInvitation(dto)`
  - `sendSubscriptionActivated(dto)`
  - `sendWeeklyReport(dto)`
  - `sendReviewAlert(dto)`

### 3. BullMQ & Redis Queue System (`EmailQueueService`, `EmailWorkerService`)
- Every email request is enqueued asynchronously to prevent blocking API responses.
- Provides exponential backoff retries (starting at 2000ms), rate limiting, dead letter queue (DLQ) routing, and failure metrics.

### 4. Resend Provider (`ResendService`)
- Handles rendering of React Email components into HTML & plain text.
- Connects to Resend API using `RESEND_API_KEY` with fallback simulation mode when running without production credentials.

### 5. Secure Token Handler (`TokenService`)
- Uses Node.js `crypto.randomBytes(32)` to generate 64-character hexadecimal tokens.
- Computes SHA-256 hash before storing in the database.
- Enforces strict TTL (Time To Live) and single-use invalidation.

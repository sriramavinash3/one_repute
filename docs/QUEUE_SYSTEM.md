# OneRepute BullMQ Queue System Guide

## Overview
The transactional email system utilizes **BullMQ** over **Redis** to ensure reliable, zero-latency email processing. Signup and password reset operations return immediate HTTP responses without waiting for external email network calls.

---

## Configuration & Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `REDIS_HOST` | Redis Server IP/Hostname | `127.0.0.1` |
| `REDIS_PORT` | Redis Port | `6379` |
| `REDIS_PASSWORD` | Optional Redis Password | `undefined` |

---

## Job Lifecycle & Worker Processing

1. **Job Enqueueing**:
   - `EmailQueueService.addJob(payload)` pushes the email job onto the `email-queue` queue.
   - Default Job Options:
     - **Attempts**: 3
     - **Backoff**: Exponential (starting at 2000ms)
     - **Retention**: Keeps completed jobs for audit logs, preserves failed jobs for DLQ inspection.

2. **Worker Processing**:
   - `EmailWorkerService` consumes jobs concurrently (default concurrency: 5).
   - Renders the appropriate React Email component into clean HTML & plain-text.
   - Dispatches email via `ResendService`.
   - Records latency and status to `EmailMetricsService`.

3. **Dead Letter Queue (DLQ)**:
   - Jobs failing after 3 retries are logged under `[DEAD LETTER QUEUE]` with complete failure reason and context.
   - Failed jobs can be inspected or re-queued via `/api/email/metrics`.

4. **Fault Tolerance & Fallback**:
   - If Redis is offline or disconnected, `EmailQueueService` gracefully logs a notice and processes jobs in inline fallback mode so application features remain fully operational.

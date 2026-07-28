# System Architecture - Restaurant AI Review Automation

This document provides a comprehensive overview of the architecture, components, and data flows of the **Restaurant AI Review Automation** platform.

---

## 1. High-Level System Architecture

The platform follows a modern, decoupled client-server architecture. It integrates with external services (Firebase, Google Business Profile API, OpenAI API, Twilio API, and Apify Scraper API) to ingest, process, respond to, and escalate customer reviews.

```mermaid
graph TD
    %% Frontend Client
    Client[React Frontend Dashboard] <--> |HTTPS / REST APIs| Backend[Express.js Backend Service]
    Client <--> |Firebase SDK Auth & Analytics| Firebase[Firebase Services Auth & Firestore]
    
    %% Backend Orchestrator & Services
    Backend <--> |Firestore Admin SDK| Firebase
    Backend --> |Scheduled Cron Jobs| Jobs[Review Sync Cron Jobs]
    
    %% External Integrations
    Jobs & Backend <--> |Google Maps Scraper API| Apify[Apify Platform]
    Jobs & Backend <--> |Google Business Profile APIs| GoogleAPIs[Google Business Profile API]
    Backend --> |Sentiment & Response Gen| OpenAI[OpenAI API]
    Backend --> |WhatsApp Notifications| Twilio[Twilio WhatsApp API]
```

---

## 2. Core Components

### A. Frontend Dashboard (`/frontend`)
*   **Vite + React (v19):** Single Page Application offering instant loading times and responsive rendering.
*   **Zustand:** Lightweight, centralized state management framework for user session state, outlet preferences, and dashboard UI configurations.
*   **React Query (@tanstack/react-query):** Manages server-state, handles request caching, background refetching, and automated state synchronization.
*   **Tailwind CSS + Framer Motion:** Implements a design system featuring dark modes, card elevations, smooth transitions, and high-fidelity micro-interactions.
*   **Firebase Client SDK:** Secures user authentication and provides direct, structured client login via OAuth (Sign in with Google).

### B. Backend Services API (`/backend`)
*   **Node.js & Express:** Lightweight, scalable REST API handling authentication, CRUD operations for outlets, dashboard telemetry, and webhook endpoints.
*   **Node-Cron Scheduler:** Orchestrates the periodic fetch pipeline running at configured periods (10:00 AM, 3:00 PM, and 9:00 PM).
*   **Repository Pattern:** Decouples API endpoints/services from database operations. Repositories (e.g., `outletRepo`, `reviewRepo`) act as data brokers for Firestore.
*   **Providers Layer:** Abstract interfaces handling external vendor communications (e.g., Twilio / 360dialog for WhatsApp, Apify for scraper actions).
*   **Firebase Admin SDK:** Direct administrative interface to Firestore, running queries, managing custom user tokens, and performing secure database mutations.

---

## 3. Data Processing Pipeline (Review Sync & Escalation)

The sequence diagram below details the data flow during a standard scheduled sync review cron job.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Cron Job Scheduler
    participant Engine as Review Sync Service
    participant Scraper as Apify / Google API
    participant DB as Firestore Database
    participant AI as OpenAI Service
    participant WhatsApp as WhatsApp Gateway (Twilio)

    Cron->>Engine: Trigger Review Sync Process
    Engine->>DB: Fetch Active Outlets (with decryption)
    DB-->>Engine: Return Active Outlets List
    
    loop For Each Active Outlet
        Engine->>Scraper: Request Latest Reviews (Google Maps / GBP API)
        Scraper-->>Engine: Return New Reviews
        
        loop For Each New Review
            Engine->>DB: Deduplicate (Check if reviewExists)
            alt Review is New
                Engine->>AI: Analyze Review (Sentiment & Reply Generation)
                AI-->>Engine: Sentiment, Reply Suggestion, and Summary
                
                Engine->>DB: Save Review (Status: pending/flagged)
                
                alt Review Sentiment is Positive (Rating >= Threshold)
                    Engine->>DB: Update Review Status -> auto_replied / pending_review
                else Review Sentiment is Negative (Rating < Threshold)
                    Engine->>Engine: Flag for Escalation
                    Engine->>WhatsApp: Send Alert to Manager (Twilio/360dialog)
                    WhatsApp-->>Engine: Message Sent Confirmation
                    Engine->>DB: Update Review Status -> escalated (save AlertSentAt)
                end
            end
        end
    end
```

---

## 4. Security & Cryptographic Safeguards

*   **Google OAuth Refresh Token Security:** Outlet Google refresh tokens are stored in Firestore using industry-standard **AES-256-CBC encryption**. They are only decrypted in-memory on the backend server when initiating direct requests to the Google Business Profile API.
*   **Secrets Isolation:** API keys, database credentials, encryption salts, and private keys are loaded strictly from the system environment (`.env`) and are never committed to source control or exposed to the frontend.
*   **Rate Limiting & Helmet:** Backend Express applications enforce strict API rate limiting (`express-rate-limit`) to prevent DDoS attacks, and use `helmet` headers to safeguard against typical web vulnerabilities.
*   **Firebase Auth Rules:** Access to Firestore data is guarded by client-side Firestore rules and server-side authentication validation middlewares.

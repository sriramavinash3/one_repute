# API Documentation - Restaurant AI Review Automation

This document provides documentation for the Restaurant AI Review API. All APIs return JSON responses and expect payloads in JSON format.

---

## 1. Authentication & Security

All private endpoints require client authentication using a Firebase ID Token passed in the `Authorization` header.

```http
Authorization: Bearer <Firebase_ID_Token>
```

---

## 2. API Endpoint Reference

### A. Authentication & User Management (`/api/auth`)

#### 1. Google Authentication Callback
*   **Endpoint:** `POST /api/auth/google`
*   **Description:** Authenticate or create a session using Google Sign-In.
*   **Payload:**
    ```json
    {
      "idToken": "firebase_auth_id_token_here"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "user": {
        "uid": "usr_123456",
        "email": "owner@restaurant.com",
        "role": "outlet_owner"
      }
    }
    ```

---

### B. Outlets Configuration (`/api/outlets`)

#### 1. Register New Outlet (Admin Only)
*   **Endpoint:** `POST /api/outlets/create`
*   **Description:** Creates a new restaurant outlet entry.
*   **Payload:**
    ```json
    {
      "name": "Bistro Roma - Downtown",
      "ownerEmail": "roma_downtown@gmail.com",
      "sentimentThreshold": 4.0,
      "whatsappManagerNumber": "+919876543210"
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "success": true,
      "outletId": "out_abc123XYZ",
      "message": "Outlet registered successfully."
    }
    ```

#### 2. Get All Connected Outlets
*   **Endpoint:** `GET /api/outlets`
*   **Description:** Retrieve all registered outlets.
*   **Response (200 OK):**
    ```json
    [
      {
        "id": "out_abc123XYZ",
        "name": "Bistro Roma - Downtown",
        "ownerEmail": "roma_downtown@gmail.com",
        "isActive": true,
        "sentimentThreshold": 4,
        "googleLocationId": "loc_987654"
      }
    ]
    ```

#### 3. Update Outlet Preferences
*   **Endpoint:** `PUT /api/outlets/:id`
*   **Description:** Modifies review threshold, alerts, or details.
*   **Payload:**
    ```json
    {
      "sentimentThreshold": 3.5,
      "whatsappManagerNumber": "+918888888888"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Outlet settings updated successfully."
    }
    ```

---

### C. Reviews & AI Automation (`/api/reviews`)

#### 1. Retrieve Reviews (sorted + filterable)
*   **Endpoint:** `GET /api/reviews`
*   **Query Parameters:**
    *   `outletId`: String (Filter by outlet)
    *   `status`: `pending` | `suggested` | `responded` | `escalated` | `failed`
    *   `rating`: `4+` (≥4) | `3+` (≥3) | `1-2` (≤2) | exact value `1..5`
    *   `search`: String (customer name / review text, case-insensitive contains)
    *   `sort`: `date_desc` (default, newest first) | `date_asc` (oldest first)
    *   `from`: Date filter start. ISO datetime (e.g. `2026-08-01T18:30:00.000Z`)
        or bare `YYYY-MM-DD` (interpreted as UTC midnight of that day)
    *   `to`: Date filter end. ISO datetime or bare `YYYY-MM-DD` (interpreted as
        UTC end-of-day `23:59:59.999`, so the selected day is fully included)
    *   `page`: Number (1-based, default 1)
    *   `limit`: Number (default 10)
*   **Sorting:** Reviews are always sorted by the original Google review date
    (`reviewTimestamp`), never by display-formatted strings. Identical
    timestamps are tie-broken by `id` (DESC for `date_desc`, ASC for
    `date_asc`) so pagination never skips or duplicates rows.
*   **Date ranges:** `from`/`to` are applied against `reviewTimestamp`.
    Invalid or reversed ranges (`from` > `to`) return an empty result set.
*   **Response (200 OK):**
    ```json
    {
      "data": [
        {
          "id": "rev_998877",
          "customerName": "John Doe",
          "rating": 5,
          "text": "Amazing food and super fast service!",
          "reviewTimestamp": "2026-07-15T10:15:30.000Z",
          "status": "responded",
          "aiResponse": "Thank you John! We are glad you loved the food.",
          "requiresManualReply": false,
          "isEscalated": false,
          "hasFailed": false
        }
      ],
      "pagination": { "total": 42, "page": 1, "limit": 10, "totalPages": 5 },
      "counts": { "all": 42, "pending": 10, "suggested": 12, "responded": 18, "escalated": 1, "failed": 1 }
    }
    ```
*   **Examples:**
    *   Newest reviews for an outlet: `GET /api/reviews?outletId=abc&sort=date_desc`
    *   July 2026 for an outlet: `GET /api/reviews?outletId=abc&from=2026-07-01&to=2026-07-31`
    *   Exact 2-day window (timezone-precise): `GET /api/reviews?from=2026-08-13T00:00:00.000Z&to=2026-08-14T23:59:59.999Z`
    *   Page 3 of 20 per page within a range: `GET /api/reviews?outletId=abc&from=2026-07-01&to=2026-07-31&page=3&limit=20`

#### 2. Authoritative Review Count for an Outlet
*   **Endpoint:** `GET /api/reviews/count?outletId=abc`
*   **Description:** Returns the exact Total Reviews count for one outlet using a
    database-level `COUNT` (Prisma/PostgreSQL primary; Firestore aggregate
    `count()` fallback). Never loads review rows, so it is not capped by any
    pagination or list limit. Uses the same outlet scope and eligibility rules
    as the reviews list, so the KPI always matches the list's `pagination.total`.
*   **Query Parameters:**
    *   `outletId`: String (**required** — a missing outletId returns `400` and
        never an unscoped global count)
*   **Authorization:** The outlet must belong to the authenticated user's
    customer scope. Accessing another customer's outlet returns `403 Forbidden`.
    Admins are exempt from the ownership check.
*   **Response (200 OK):**
    ```json
    { "outletId": "abc", "totalReviews": 42, "total": 42 }
    ```
*   **Errors:** `400` (missing `outletId`), `403` (outlet belongs to another
    customer), `404` (outlet not found / inactive / removed), `500` (failure).

#### 3. Submit AI Review Reply manually
*   **Endpoint:** `POST /api/reviews/:id/reply`
*   **Description:** Manually review, override or submit the AI generated response directly to the source provider (Google Business profile).
*   **Payload:**
    ```json
    {
      "replyText": "Thank you so much for your feedback!"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Reply successfully published to Google Maps."
    }
    ```

---

### D. Sync & System Operations

#### 1. Google Business Account Sync
*   **Endpoint:** `POST /api/google/sync-business-data`
*   **Description:** Syncs and refreshes locations from Google Places and Google Business Profile SDK.
*   **Payload:**
    ```json
    {
      "outletId": "out_abc123XYZ",
      "forceRefresh": false
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "syncedLocationsCount": 3
    }
    ```

#### 2. Trigger Live Review Processing (Developer / Testing)
*   **Endpoint:** `GET /api/test-live-reviews`
*   **Description:** Bypass scheduler/cron and pull reviews instantly.
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "processedReviewsCount": 12,
      "escalationsTriggered": 2
    }
    ```

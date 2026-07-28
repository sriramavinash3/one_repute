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

#### 1. Retrieve Historical Reviews
*   **Endpoint:** `GET /api/reviews`
*   **Query Parameters:**
    *   `outletId`: String (Filter by outlet)
    *   `sentiment`: `positive` | `negative` | `neutral`
    *   `status`: `pending` | `replied` | `escalated`
*   **Response (200 OK):**
    ```json
    {
      "reviews": [
        {
          "reviewId": "rev_998877",
          "author": "John Doe",
          "rating": 5,
          "comment": "Amazing food and super fast service!",
          "sentiment": "positive",
          "aiResponse": "Thank you John! We are glad you loved the food. Hope to see you again soon!",
          "status": "replied",
          "repliedAt": "2026-07-15T10:15:30Z"
        }
      ]
    }
    ```

#### 2. Submit AI Review Reply manually
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

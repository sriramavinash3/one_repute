# Restaurant AI Review Automation

A comprehensive, automated platform designed to help restaurants manage their online reputation, particularly on Google My Business. This project automatically fetches reviews using Scraper API (Apify) or Google APIs, processes them using AI, and routes them appropriately—either auto-replying to positive reviews or escalating negative reviews via WhatsApp.

---

## 1. Project Flow

1. **Review Ingestion:** The backend uses scheduled jobs (`node-cron`) to periodically fetch new customer reviews from connected platforms. This is done via Google My Business (GBP) direct integration or through Scraper APIs (like Apify) for other platforms.
   *Note: Currently, we are using the Scraper API version as a temporary measure. This is because Google My Business (GMB) requires an account to be verified for at least 60 days before API access is fully granted. Without direct GMB access, automatically replying to reviews is impossible. Once we receive GMB API access, we will transition to the GMB integration to enable the auto-reply feature.*
2. **AI Processing:** Once fetched, the reviews are analyzed. Using the **OpenAI API**, the system determines the sentiment and generates contextual, professional responses.
3. **Automated Actions:**
   - **Positive Reviews:** If the review rating exceeds a configured threshold, the system automatically posts the AI-generated response to the dashboard with instant copy module.
   - **Negative Reviews:** If the review is below the threshold, it is flagged for manual intervention, and an instant escalation alert is sent to restaurant managers via **WhatsApp** (using Twilio).
4. **Dashboard & Analytics:** The frontend provides a modern, responsive dashboard where admins can view review metrics, manage connected outlets (Google accounts), and monitor the automated actions taken by the AI.

---

## 2. Technology Stack

### Frontend
- **Framework:** React 19, Vite
- **Styling:** Tailwind CSS, Radix UI (accessible components), Framer Motion (animations)
- **State Management:** Zustand, React Query (@tanstack/react-query)
- **Routing & Utilities:** React Router DOM, Axios, clsx, tailwind-merge
- **Data Visualization:** Recharts
- **Authentication:** Firebase Client SDK

### Backend
- **Environment:** Node.js, Express.js
- **Database & Services:** Firebase Admin SDK (Firestore Database & Auth)
- **External Integrations:**
  - **OpenAI:** For generating review responses and sentiment analysis.
  - **Twilio:** For sending WhatsApp escalation alerts.
  - **Google APIs:** For syncing Google Business accounts and posting replies.
  - **Apify (Scraper API):** For fetching reviews from unsupported platforms.
- **Utilities:** node-cron (scheduling), Winston (logging), Joi (validation), Helmet & Express Rate Limit (security).

---

## 3. Login Credentials

For local testing and demonstration purposes, you can use the following mock credentials to access the admin dashboard. 
 
 Portal : "https://onerepute.com/login"

- **Email:** `admin@onerepute.com`
- **Password:** `Freddie@060993`
Login this account in chrome and use sign in with google.
Using the admin dashboard create new outlet to test outlet exeperience.

---

## 4. API Details

The backend provides a robust REST API for the frontend and webhook integrations. Below are some of the key endpoints handling the AI automation and Google integrations:

### Core Resource Routes
- **`POST /api/outlets/create`**: Create a new outlet. Used by the admin to register an outlet's email before they can sign in.
- **`GET /api/outlets`**: Fetch all configured outlets and their settings.
- **`USE /api/auth/*`**: Authentication and user management.
- **`USE /api/reviews/*`**: Fetching stored reviews and analytics for the frontend dashboard.

### Sync Google Business Data
- **Endpoint:** `POST /api/google/sync-business-data`
- **Purpose:** Connects to Google APIs to fetch and cache the latest locations and business data for a specific outlet.
- **Request Body:**
  ```json
  {
    "outletId": "outlet_document_id_here",
    "forceRefresh": false
  }
  ```

### Trigger Live Review Processing (Testing)
- **Endpoint:** `GET /api/test-live-reviews`
- **Purpose:** Manually triggers the review fetching and AI processing pipeline for active outlets. Useful for testing the scraper and AI without waiting for the cron job.

---

## 5. Walkthrough

Here is a step-by-step guide on how to use the application from an administrative and outlet owner perspective:

1. **Admin Outlet Creation:** 
   - The platform admin logs in using the admin credentials (`admin@onerepute.com`).
   - The admin clicks on the "Create New Outlet" button and enters the customer's (outlet owner's) email address along with other required details.
   - *Note: No user can sign in with Google Registration unless the admin has first created the outlet and registered their email in the system.*
2. **Outlet Owner Login:** 
   - Once the admin has registered the outlet, the outlet owner can navigate to the application and securely log in using "Sign in with Google" with their registered email address.
   - Upon logging in, the owner can view their personalized dashboard showing analytics and review metrics.
3. **Automated Review Processing:**
   - The backend automation is scheduled to run at **10:00 AM, 3:00 PM, and 9:00 PM** every day.
   - During these scheduled times, the system will trigger the Scraper API/GMB to fetch any new reviews, analyze their sentiment using AI, and take the configured automated actions (e.g., sending WhatsApp escalations for negative reviews).
4. **Viewing Results:**
   - After the automation triggers at the scheduled times, the outlet owner can simply refresh their dashboard to see the latest fetched reviews and the actions taken by the AI.

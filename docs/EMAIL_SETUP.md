# OneRepute Local Setup & Configuration Guide

## Environment Variables Checklist

Ensure the following variables are present in `backend/.env`:

```env
# Resend Email Integration
RESEND_API_KEY=re_your_production_key_here
EMAIL_FROM=OneRepute <notifications@onerepute.com>
APP_URL=https://onerepute.com
SUPPORT_EMAIL=support@onerepute.com
COMPANY_ADDRESS=

# Redis Infrastructure
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# App Environment
NODE_ENV=development
PORT=3000
```

---

## Local Development & Testing

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Run Email Test Suite**:
   ```bash
   npm run test:email
   ```

3. **Start NestJS Email Server in Development Mode**:
   ```bash
   npm run dev
   ```

4. **Verify Email Metrics**:
   ```bash
   curl http://localhost:3000/api/email/metrics
   ```

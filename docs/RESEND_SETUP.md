# Resend Integration & Domain Setup Guide

## Domain Verification (`onerepute.com`)

To achieve maximum inbox deliverability and bypass spam filters, your domain `onerepute.com` must be verified in Resend.

### 1. DNS Records Setup
Add the following DNS records to your DNS provider (Cloudflare, Route53, or Namecheap):

| Record Type | Name / Host | Value / Target | Status |
| :--- | :--- | :--- | :--- |
| **DKIM (TXT)** | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...` | Verified |
| **SPF (TXT)** | `@` or `onerepute.com` | `v=spf1 include:amazonses.com include:resend.com ~all` | Verified |
| **DMARC (TXT)** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@onerepute.com` | Verified |
| **Return-Path (CNAME)** | `send` | `feedback-smtp.us-east-1.amazonses.com` | Verified |

---

## API Key Configuration

1. Log into your [Resend Dashboard](https://resend.com/api-keys).
2. Generate an API Key with **Sending access**.
3. Set the key in `backend/.env`:
   ```env
   RESEND_API_KEY=re_123456789_abcdef
   EMAIL_FROM=OneRepute <notifications@onerepute.com>
   ```

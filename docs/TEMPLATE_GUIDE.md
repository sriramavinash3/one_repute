# OneRepute React Email Template Guide

## Template Directory

All email templates reside under `backend/src/emails/`:

| File | Subject Line | Purpose |
| :--- | :--- | :--- |
| `components/Layout.tsx` | N/A | Base layout wrapper with logo, dark mode CSS, and footer links. |
| `Welcome.tsx` | `Welcome to OneRepute 🚀` | Account onboarding welcome & platform feature highlights. |
| `VerifyEmail.tsx` | `Verify your OneRepute email address` | Email confirmation with single-use verification button. |
| `ResetPassword.tsx` | `Reset your OneRepute password` | Password reset request with 15-minute expiration warning. |
| `PasswordChanged.tsx` | `Security Alert: Your OneRepute password was changed` | Security confirmation when password is updated. |
| `TeamInvite.tsx` | `You have been invited to join {{workspaceName}}` | Workspace collaboration invitation. |
| `SubscriptionActivated.tsx` | `Subscription Confirmed: {{planName}}` | Payment receipt and plan activation confirmation. |
| `WeeklyReport.tsx` | `Weekly Reputation Report for {{businessName}}` | Automated reputation analytics & review metrics. |
| `ReviewAlert.tsx` | `New {{rating}}-Star Review Alert` | Instant review alert with AI Auto-Reply shortcut. |

---

## Brand Guidelines & Styling Rules

- **Primary Brand Color**: `#2563EB` (Royal Blue)
- **Typography**: Inter / `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`
- **Dark Mode Support**:
  - Container backgrounds adapt dynamically using `@media (prefers-color-scheme: dark)`.
  - Email cards switch to `#1E293B` with dark borders `#334155`.
- **Email Client Compatibility**:
  - All layout structures use explicit table cells (`<td>`, `<tr>`) and inline styles for maximum compatibility across Apple Mail, Gmail, Outlook, and Yahoo Mail.

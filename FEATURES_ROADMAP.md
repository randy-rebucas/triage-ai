# CMS Triage AI — Feature Roadmap

> Last updated: April 6, 2026

---

## Currently Implemented

- **AI Triage Chat** — streaming symptom extraction, adaptive follow-up questions, risk scoring, and report generation via OpenAI
- **Multi-tenant architecture** — each clinic gets its own `/{tenant}/` path
- **Patient auth** — login, OTP (Twilio), QR login, JWT sessions
- **Reports** — PDF download + email delivery (Resend)
- **PWA support** — service worker, offline page, installable on mobile
- **Clinic onboarding** — self-service via `/onboard`
- **Rate limiting + CSRF** — already in middleware

---

## Features to Leverage

### High-Impact / Near-Complete
> Already have env vars or stubs in place — lowest effort to ship

1. **Push Notifications (VAPID)**
   - `.env.example` already has `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
   - PWA infrastructure (`PWAProvider.tsx`, `sw.js`) is already in place
   - Use case: notify patients when report is ready, or send follow-up reminders

2. **Twilio SMS OTP**
   - `patientAuthService.ts` already has optional Twilio wiring
   - Needs: Twilio env vars set + UI fallback for SMS vs email OTP selection

3. **Cloudinary Image Uploads**
   - Env placeholder already exists
   - Use case: patients attach photos (rashes, wounds, prescriptions) in the triage chat for AI-assisted visual context

4. **Doctor / Staff Dashboard**
   - Described in `README.md` but not yet built
   - Triage session data and patient accounts are already in MongoDB
   - Would be a new route group: `[tenant]/staff/`

---

### Medium Effort, High Value

5. **Audit Logging**
   - `README.md` mentions an `AuditLog` model (not yet implemented)
   - Healthcare compliance requirement: track who accessed which records and when
   - Middleware + auth infrastructure already supports it

6. **Clinical Records / History**
   - `README.md` mentions `/api/records` (not yet implemented)
   - `TriageSession` data is already rich enough to surface a structured visit timeline
   - Would be surfaced in the patient dashboard

7. **PayPal Payments**
   - `.env.example` has `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET`
   - Use case: gate premium triage features, or allow clinics to charge per-session or via subscription

8. **Scheduled Reminders / Cron Jobs**
   - `.env.example` has `CRON_SECRET` and `INSTALL_SECRET`
   - Use case: send follow-up emails 24–48 hrs after a triage session
   - Needs a `/api/cron/` route group with bearer-token protection

9. **Analytics Dashboard for Clinic Admins**
   - No new data collection needed — uses existing `TriageSession` MongoDB data
   - Aggregate: top symptoms, risk score distribution, peak triage hours per clinic

---

### AI Enhancements

10. **Multi-language Support**
    - Add a language selector in the triage chat UI
    - Parameterize triage engine prompts for Filipino (Tagalog) and English
    - Directly relevant to the Philippines-oriented target audience

11. **Emergency Escalation Flow**
    - Emergency keyword detection already exists in `triageEngine.ts`
    - Wire to auto-notify clinic staff via Twilio SMS on high-risk detection

12. **AI Triage Validation by Staff**
    - `README.md` mentions `/api/triage/validate` and `/api/triage/pending` (not yet built)
    - Allow staff to review and approve AI risk scores before they are finalized

---

### Developer / Ops

13. **MyClinicSoft Deep Integration**
    - `myclinicsoft-client.ts` is already set up for the external tenant registry
    - Deeper integration: sync patient records, billing, and appointment data

14. **Tenant Self-Service Settings Page**
    - Clinic branding customization: logo, colors, contact info
    - Store in the existing `Tenant` model — no schema changes needed

---

## Priority Suggestion

| Priority | Feature | Effort |
|----------|---------|--------|
| High | Doctor/Staff Dashboard | Medium |
| High | Audit Logging | Low |
| High | Emergency Escalation (Twilio SMS) | Low |
| Medium | Push Notifications (VAPID) | Low |
| Medium | Clinical Records / History | Medium |
| Medium | Multi-language Support | Medium |
| Low | PayPal Payments | Medium |
| Low | Analytics Dashboard | Medium |
| Low | Cloudinary Image Uploads | Low |

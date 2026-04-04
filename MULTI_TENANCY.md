# Multi-Tenancy Implementation

**Project:** MyClinicsoftSoft  
**Architecture:** Shared database, subdomain-based tenant isolation  
**Last updated:** 2026-04-04

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tenant Model](#2-tenant-model)
3. [Subdomain Resolution](#3-subdomain-resolution)
4. [Session & Cookie Strategy](#4-session--cookie-strategy)
5. [Data Isolation](#5-data-isolation)
6. [Application Layout — Tenant Guard](#6-application-layout--tenant-guard)
7. [Edge Middleware (proxy.ts)](#7-edge-middleware-proxyts)
8. [Tenant Onboarding](#8-tenant-onboarding)
9. [Subscription & Billing](#9-subscription--billing)
10. [Storage Limits](#10-storage-limits)
11. [Tenant Management APIs](#11-tenant-management-apis)
12. [CLI Scripts](#12-cli-scripts)
13. [Environment Variables](#13-environment-variables)
14. [Known Issues & Gaps](#14-known-issues--gaps)
15. [Key File Reference](#15-key-file-reference)

---

## 1. Architecture Overview

MyClinicsoftSoft uses a **shared-database, shared-schema** multi-tenant approach. Every clinic (tenant) shares the same MongoDB instance and collections. Tenant isolation is enforced at the application layer by attaching a `tenantId` field to every document and filtering all queries by it.

```
Internet
    │
    ├── clinic-a.myclinicsoft.com  ─── tenant "clinic-a" ─── tenantId: 664abc...
    ├── clinic-b.myclinicsoft.com  ─── tenant "clinic-b" ─── tenantId: 664def...
    └── myclinicsoft.com           ─── root domain (marketing/onboarding)
                                           │
                                     MongoDB Atlas
                                     (single cluster, single DB)
                                     All collections — filtered by tenantId
```

**Key design decisions:**

| Decision | Choice | Reason |
|---|---|---|
| Database isolation | Shared DB + `tenantId` field | Simpler ops, lower cost at small tenant counts |
| Tenant identification | Subdomain (`host` header) | Clean URLs, no login-time tenant selection needed |
| Session scoping | `tenantId` embedded in JWT | Single cookie works across page navigations |
| Cross-subdomain auth | Apex-domain cookie (`COOKIE_DOMAIN`) | One login session for future staff admin dashboards |

---

## 2. Tenant Model

**File:** `models/Tenant.ts`

Each clinic is a document in the `Tenant` collection.

### Schema

```typescript
{
  _id:         ObjectId    // auto-generated
  name:        string      // required, 2+ chars — "Sunshine Clinic"
  subdomain:   string      // required, unique, lowercase, regex /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
  displayName: string?     // optional public-facing name
  email:       string?     // clinic contact email
  phone:       string?
  address: {
    street, city, state, zipCode, country   // all optional strings
  }
  settings: {
    timezone:         string   // default "UTC"
    currency:         string   // default "PHP"
    currencySymbol:   string?
    currencyPosition: "before" | "after"
    dateFormat:       string   // default "MM/DD/YYYY"
    timeFormat:       "12h" | "24h"
    language:         "en" | "es"
    numberFormat: { decimalSeparator, thousandsSeparator, decimalPlaces }
    logo:             string?  // URL
    primaryColor:     string?
    secondaryColor:   string?
  }
  status:      "active" | "inactive" | "suspended"   // default "active"
  subscription: {
    plan:                  string?     // "trial" | "basic" | "pro" etc.
    status:                "active" | "cancelled" | "expired"
    billingCycle:          "monthly" | "yearly"
    expiresAt:             Date?
    renewalAt:             Date?
    paypalOrderId:         string?
    paypalSubscriptionId:  string?
    processedWebhookIds:   string[]   // idempotency guard
    paymentHistory: [{
      transactionId, orderId, amount, currency, payerEmail
      plan, billingCycle, status, paidAt
    }]
  }
  createdAt:   Date
  updatedAt:   Date
}
```

### Subdomain rules

The `subdomain` field must:
- Be 2–63 characters
- Contain only lowercase letters, numbers, and hyphens
- Not start or end with a hyphen
- Not be a reserved word: `www`, `api`, `admin`, `app`, `mail`, `ftp`, `localhost`, `staging`, `dev`, `test`, `demo`

These rules are validated both in the API route (`/api/tenants/onboard`) and in the Mongoose `pre('save')` hook.

### Indexes

```
subdomain — unique (auto from `unique: true`)
status — 1
subscription.status — 1
subscription.paypalOrderId — 1
createdAt — -1
```

---

## 3. Subdomain Resolution

**File:** `lib/tenant.ts`

### `extractSubdomain(host)`

Derives the tenant key from the incoming `Host` (or `x-forwarded-host`) header.

```
Request host              →  Extracted subdomain
─────────────────────────────────────────────────
clinic-a.myclinicsoft.com →  "clinic-a"
www.myclinicsoft.com      →  null  (root domain)
myclinicsoft.com          →  null  (root domain)
clinic-a.localhost        →  "clinic-a"  (dev)
localhost                 →  null  (dev root)
clinic---pr-42.vercel.app →  "clinic"  (Vercel preview)
```

**Logic by environment:**

```
1. Strip port from host
2. If host contains "localhost" or "127.0.0.1":
     - If matches *.localhost → return first label (unless "www")
     - Else → return null
3. If matches {tenant}---*.vercel.app (Vercel preview):
     - Return everything before "---"
4. Production:
     - Load ROOT_DOMAIN from env (e.g. "myclinicsoft.com")
     - Exclude apex ("myclinicsoft.com") and "www.myclinicsoft.com"
     - If host ends with ".myclinicsoft.com" → strip it → return subdomain
     - Else → return null
```

### `getTenantContext()`

```typescript
async function getTenantContext(): Promise<TenantContext>
// Returns: { tenantId: string|null, subdomain: string|null, tenant: TenantData|null }
```

1. Reads `host` / `x-forwarded-host` from Next.js `headers()`
2. Calls `extractSubdomain(host)`
3. Queries `Tenant.findOne({ subdomain, status: 'active' })`
4. Returns `{ tenantId, subdomain, tenant }` — or nulls if no match

This is the **primary entry point** used by API routes, server components, and the app layout. It is `server-only` and cannot be called from client components.

### Typical usage pattern in API routes

```typescript
const session = await verifySession();
const tenantContext = await getTenantContext();
const tenantId = session.tenantId || tenantContext.tenantId;

// Use in queries:
const patients = await Patient.find({ tenantIds: new Types.ObjectId(tenantId) });
const appointments = await Appointment.find({ tenantId: new Types.ObjectId(tenantId) });
```

The double-source pattern (`session.tenantId || tenantContext.tenantId`) handles:
- Requests from the browser (host header present — subdomain resolved)
- Server-to-server or cron calls (session JWT carries tenantId instead)

---

## 4. Session & Cookie Strategy

**File:** `app/lib/dal.ts`

### Staff session JWT

The `session` cookie is an **HS256 JWT** signed with `SESSION_SECRET`.

**Payload:**
```typescript
{
  userId:    string           // User._id
  email:     string
  role:      string           // role name (e.g. "admin", "doctor")
  roleId:    string?          // Role._id
  tenantId:  string?          // Tenant._id — scopes the session to a clinic
  expiresAt: number           // UNIX timestamp
}
```

The `tenantId` is embedded in the JWT at login time so server-side calls that cannot rely on subdomain (cron jobs, webhooks, admin tools) can still resolve the correct tenant.

### Cross-subdomain cookies

```
COOKIE_DOMAIN=.myclinicsoft.com
```

When set, the `session` cookie is issued with `domain: process.env.COOKIE_DOMAIN`. The leading dot means all subdomains share the same cookie:

```
clinic-a.myclinicsoft.com  ──┐
clinic-b.myclinicsoft.com  ──┤── all receive the same session cookie
myclinicsoft.com           ──┘
```

This allows staff who manage multiple clinics to switch subdomains without re-authenticating, and enables a future single-pane-of-glass admin portal.

**Cookie attributes:**
```
Name:     session
HttpOnly: true
Secure:   true (production)
SameSite: lax
MaxAge:   7 days
Domain:   process.env.COOKIE_DOMAIN (e.g. .myclinicsoft.com)
Path:     /
```

### Patient session cookie

Patient sessions use a **separate** `patient_session` cookie (no `domain` override — scoped to current subdomain) with a simpler payload:
```typescript
{ patientId, patientCode, type: "patient", email }
```

---

## 5. Data Isolation

### Primary pattern — `tenantId` field

Nearly all clinical, billing, and operational models have a `tenantId: ObjectId` field that references the `Tenant` collection. Every query filters by it.

**Models using `tenantId` (singular ObjectId):**

| Domain | Models |
|---|---|
| Auth | `User`, `Role`, `Permission`, `Admin`, `Doctor`, `Nurse`, `Receptionist`, `Accountant`, `Staff` |
| Clinical | `Appointment`, `Visit`, `Prescription`, `LabResult`, `Imaging`, `Procedure`, `Referral`, `Document` |
| Operations | `Queue`, `Invoice`, `Membership`, `InventoryItem`, `Medicine`, `Service`, `Room`, `Specialization` |
| Config | `Settings` (unique sparse index on `tenantId`) |
| SaaS | `Notification`, `AuditLog`, `PaypalOrder`, `PushSubscription` |

### Special case — `Patient.tenantIds` (array)

Patients can belong to multiple clinics (e.g. a patient who visits two clinics that both use MyClinicsoftSoft). The `Patient` model uses an **array**:

```typescript
tenantIds: [{ type: ObjectId, ref: 'Tenant' }]
```

Queries on Patient must use array membership syntax:
```typescript
// Correct:
Patient.findOne({ tenantIds: new Types.ObjectId(tenantId) })
Patient.find({ tenantIds: { $in: patientTenantIds } })

// Wrong (will always return 0 results):
Patient.findOne({ tenantId: tenantId })
```

### Backward-compatibility pattern

For tenants that existed before multi-tenancy was added, documents may have `tenantId: null` or no `tenantId` field. The `lib/tenant-query.ts` helpers encode this fallback:

```typescript
// No tenant → query for null/missing tenantId
{
  $or: [
    { tenantId: { $exists: false } },
    { tenantId: null }
  ]
}
```

This pattern appears throughout the API routes when `tenantId` resolves to null.

### `lib/tenant-query.ts` helpers

Three utility functions (currently underused — most routes apply tenant filters inline):

```typescript
// Auto-resolves tenantId from host header, adds to query
addTenantFilter(query): Promise<any>

// Synchronous version — pass tenantId explicitly
createTenantQuery(tenantId: string|null, baseQuery): any

// Add tenantId to a new document before saving
ensureTenantId(data): Promise<any>
```

> **Note:** `addTenantFilter` and `ensureTenantId` are defined but currently unused in application code. Most routes apply tenant filters inline after calling `getTenantContext()`.

### Settings isolation

Each tenant has exactly one `Settings` document (`tenantId` has a unique sparse index). The `getSettings()` helper in `lib/settings.ts` always resolves by `tenantId` from the current request context.

---

## 6. Application Layout — Tenant Guard

**File:** `app/(app)/layout.tsx`

The authenticated app shell performs two checks on every page load:

```typescript
// 1. Verify staff session
const session = await verifySession();
if (!session) redirect('/login');

// 2. Resolve tenant from subdomain
const tenantContext = await getTenantContext();

// 3. Handle subdomain mismatch
if (tenantContext.subdomain && !tenantContext.tenant) {
  // Subdomain exists in URL but not found in DB (or inactive)
  return <TenantNotFound subdomain={tenantContext.subdomain} />;
}
```

**Behavior matrix:**

| `subdomain` | `tenant` | Outcome |
|---|---|---|
| `null` | `null` | Root domain — app renders (super-admin use case) |
| `"clinic-a"` | `{...}` | Normal — renders for that clinic |
| `"clinic-a"` | `null` | Inactive/unknown subdomain — renders `TenantNotFound` |

---

## 7. Edge Middleware (proxy.ts)

**File:** `proxy.ts`

> **Critical:** This file implements Next.js edge middleware logic but is **not yet wired** as `middleware.ts`. The protections below are currently inactive. To activate, rename `proxy.ts` to `middleware.ts` at the project root (or create a `middleware.ts` that imports and calls `proxy`).

### What it protects

#### 1. Cron route protection (`/api/cron/*`)
```
All requests to /api/cron/* must include:
Authorization: Bearer <CRON_SECRET>
```
Without `CRON_SECRET` set in production, cron routes return 503. In development, they pass through.

#### 2. Install route protection (`/api/install/*`)
```
In production: requires Authorization: Bearer <INSTALL_SECRET>
Without INSTALL_SECRET set: all install routes return 403
In development: passes through freely
```

#### 3. CSRF protection (state-changing API requests)
Applies to `POST`, `PUT`, `PATCH`, `DELETE` on `/api/*` when the request carries a `session` or `patient_session` cookie.

**Exempt paths** (no CSRF check):
- `/api/subscription/webhook` — PayPal webhooks
- `/api/lab-results/third-party/webhook` — Lab system webhooks
- `/api/tenants/onboard` — Public onboarding
- `/api/medical-representatives/login` — MR auth
- `/api/patients/qr-login` — Patient QR auth

**Check logic:** The `Origin` header must match either the same host or a domain under `ROOT_DOMAIN`. Requests with no `Origin` header are allowed through (server-to-server calls).

#### 4. Security headers (every response)
```
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Config matcher
```typescript
export const config = {
  matcher: [
    '/api/cron/:path*',
    '/api/install/:path*',
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

## 8. Tenant Onboarding

### Via API — `POST /api/tenants/onboard`

Self-service clinic registration endpoint. Rate-limited (5 requests per 15 min per IP).

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Clinic legal name |
| `subdomain` | string | Yes | Unique identifier; auto-lowercased |
| `displayName` | string | No | Public-facing name |
| `email` | string | No | Clinic contact email |
| `phone` | string | No | |
| `address` | object | No | `{ street, city, state, zipCode, country }` |
| `settings.timezone` | string | No | Default: `"UTC"` |
| `settings.currency` | string | No | Default: `"USD"` |
| `settings.dateFormat` | string | No | Default: `"MM/DD/YYYY"` |
| `admin.name` | string | Yes | Full name of first admin user |
| `admin.email` | string | Yes | Must be globally unique across all tenants |
| `admin.password` | string | Yes | Min 8 characters |
| `admin.phone` | string | No | |

**What gets created (in order):**

```
1. Tenant document
   └── subscription: { plan: "trial", status: "active", expiresAt: now + 7 days }

2. Roles (5) — all scoped to tenantId:
   ├── admin      (level 100) — full access
   ├── doctor     (level 80)  — clinical access
   ├── nurse      (level 60)  — patient care + labs
   ├── receptionist (level 40) — appointments + patients
   └── accountant (level 30)  — billing + invoices

3. Permissions — one Permission document per resource/action group per role

4. Admin profile (Admin model, tenantId-scoped)

5. User account
   ├── email: admin.email
   ├── password: bcrypt(admin.password, 12)
   ├── role: adminRole._id
   ├── tenantId: tenant._id
   └── adminProfile: adminProfile._id

6. Settings document (tenantId-scoped singleton)
   └── Pre-populated from tenant data (name, address, timezone, currency)
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Tenant created successfully with seed data",
  "name": "Sunshine Clinic",
  "subdomain": "sunshine",
  "status": "active",
  "adminEmail": "admin@sunshine.com",
  "seedData": {
    "roles": 5,
    "permissions": 87,
    "settings": true
  },
  "subscription": {
    "plan": "trial",
    "status": "active",
    "expiresAt": "2026-04-11T00:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing required fields, invalid subdomain format, reserved subdomain |
| 400 | Subdomain already taken |
| 400 | Admin email already registered (globally unique) |
| 400 | Password < 8 chars |
| 400 | Invalid timezone / currency / dateFormat |
| 429 | Rate limit exceeded |
| 500 | DB error (logged with full context) |

### Via CLI — `scripts/onboard-tenant.ts`

Interactive wizard that mirrors the API flow. Run with:
```bash
npx ts-node scripts/onboard-tenant.ts
```

Prompts for: tenant name, subdomain, admin details, settings. Creates the same objects as the API.

---

## 9. Subscription & Billing

**File:** `models/Tenant.ts` — `subscription` subdocument  
**Integration:** PayPal Orders API

### Subscription lifecycle

```
Onboard → "trial" (7 days) → expired
                           ↗
             upgrade via PayPal → "active" (monthly/yearly)
                                → "cancelled" | "expired" on non-renewal
```

### Plans

Plans are stored as free-form strings in `Tenant.subscription.plan` (e.g. `"trial"`, `"basic"`, `"pro"`). No enum is enforced at the schema level.

### Payment flow

```
1. POST /api/subscription/create-order
   → Verifies tenantId (session + host must match)
   → Creates PayPal order
   → Saves PaypalOrder document with tenantId

2. PayPal redirects to:
   POST /api/subscription/capture-order
   → Verifies session.tenantId owns the PaypalOrder
   → Captures PayPal payment
   → Updates Tenant.subscription: { plan, status, expiresAt, paypalOrderId, paymentHistory[] }

3. PayPal sends webhook to:
   POST /api/subscription/webhook
   → No session — authenticated by PayPal signature + PAYPAL_WEBHOOK_ID
   → Idempotency via Tenant.subscription.processedWebhookIds[]
   → Updates Tenant.subscription on renewal/cancellation events
```

### Subscription status API

```
GET /api/subscription/status    — current plan + expiry for the calling tenant
GET /api/subscription/dashboard — full usage + billing summary
GET /api/subscription/usage     — storage + patient count + feature usage
```

---

## 10. Storage Limits

**File:** `lib/storage-tracking.ts`

Storage usage is calculated per tenant by aggregating file sizes from:

| Model | Field |
|---|---|
| `Document` | `size` |
| `Patient` | `attachments[].size` |
| `Visit` | attached files |
| `LabResult` | attached files |

`checkStorageLimit(tenantId, fileSize)` is called before any file upload. Returns `{ allowed: boolean, currentUsage: number, reason?: string }`. The upload routes (`/api/patients/[id]/upload`, `/api/documents`, etc.) call this before persisting to Cloudinary.

---

## 11. Tenant Management APIs

### Public

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/tenants/public` | GET | No | List all active tenants or look up by `?subdomain=` |
| `/api/tenants/onboard` | POST | No | Self-service clinic registration |

### Authenticated

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/tenants` | GET | Staff session | List tenants (admin) |
| `/api/tenants` | POST | Staff session | Create tenant (admin) |
| `/api/subscription/status` | GET | Staff session | Own tenant subscription status |
| `/api/subscription/create-order` | POST | Staff session | Begin PayPal payment |
| `/api/subscription/capture-order` | POST | Staff session | Complete PayPal payment |
| `/api/subscription/webhook` | POST | PayPal signature | Renewal/cancellation events |
| `/api/subscription/dashboard` | GET | Staff session | Full usage + billing dashboard |
| `/api/subscription/usage` | GET | Staff session | Resource usage counters |
| `/api/storage/usage` | GET | Staff session | Storage breakdown |
| `/api/storage/cleanup` | POST | Staff session | Remove orphaned files |

### GET /api/tenants/public

```
GET /api/tenants/public
→ Returns all active tenants (name, displayName, subdomain, email, phone, address)

GET /api/tenants/public?subdomain=clinic-a
→ Returns the single matching tenant or 404
```

---

## 12. CLI Scripts

| Script | Purpose |
|---|---|
| `scripts/onboard-tenant.ts` | Interactive CLI to create a new tenant with all seed data |
| `scripts/delete-tenant.ts` | Permanently deletes a tenant and all its data across all models |
| `scripts/seed-data.ts` | Seeds demo data for a given tenant (creates default tenant if none exists) |
| `scripts/seed-medicines.ts` | Seeds medicine catalogue for a tenant |
| `scripts/seed-specializations.ts` | Seeds doctor specializations for a tenant |
| `scripts/create-admin.ts` | Creates an admin user for an existing tenant |
| `scripts/reset-db.ts` | Drops and re-creates the database (development only) |

### `delete-tenant.ts` — what it deletes

Iterates over a hardcoded list of models and calls `deleteMany({ tenantId })`:

```
User, Admin, Doctor, Nurse, Receptionist, Accountant, Staff
Patient, Appointment, Visit, Prescription, LabResult
Invoice, Membership, InventoryItem, Medicine, Service, Room
Queue, Document, Notification, AuditLog, Settings, Role, Permission
```

Then calls `Tenant.deleteOne({ _id })`.

> Patient deletion uses `{ tenantIds: tenantId }` (array membership) rather than `{ tenantId }`.

---

## 13. Environment Variables

### Required for multi-tenancy

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `SESSION_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -base64 32` |
| `ROOT_DOMAIN` | Apex domain used for subdomain extraction | `myclinicsoft.com` |
| `COOKIE_DOMAIN` | Cookie domain for cross-subdomain auth | `.myclinicsoft.com` |

### Required for security features

| Variable | Description |
|---|---|
| `CRON_SECRET` | Bearer token for cron route protection |
| `ENCRYPTION_KEY` | Data encryption key (32 bytes, base64) |
| `INSTALL_SECRET` | Bearer token for install route protection (production) |

### Required for subscription/billing

| Variable | Description |
|---|---|
| `PAYPAL_CLIENT_ID` | PayPal API client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal API secret |
| `PAYPAL_WEBHOOK_ID` | Webhook ID for PayPal event verification |

### Optional

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | SMS sending |
| `TWILIO_AUTH_TOKEN` | SMS sending |
| `TWILIO_PHONE_NUMBER` | SMS sender number |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | File storage |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push notifications |

### Local development setup

```bash
cp .env.example .env.local
```

Minimum `.env.local` for local dev:
```env
MONGODB_URI=mongodb://localhost:27017/clinic-management
SESSION_SECRET=any-long-random-string-for-dev
ROOT_DOMAIN=localhost
# COOKIE_DOMAIN intentionally left empty for dev
```

For subdomain testing locally, add to `/etc/hosts` (or use [localhost.run](https://localhost.run)):
```
127.0.0.1  clinic-a.localhost
127.0.0.1  clinic-b.localhost
```

---

## 14. Known Issues & Gaps

### Critical

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | **`proxy.ts` is not wired as `middleware.ts`** | `proxy.ts` | CSRF protection, cron auth, and security headers are **not active**. Fix: rename or re-export as `middleware.ts` at project root. |
| 2 | **`app/api/tenants/route.ts` uses non-existent fields** | `app/api/tenants/route.ts` | Uses `slug`, `isActive`, `domain` — none exist in `models/Tenant.ts` which has `subdomain` and `status`. This route is broken as-is. |

### Moderate

| # | Issue | Location | Impact |
|---|---|---|---|
| 3 | **`getTenantBySlug` queries `slug` field** | `lib/tenant.ts` | `Tenant` schema has no `slug` field. Function always returns `null`. |
| 4 | **`addTenantFilter` / `ensureTenantId` unused** | `lib/tenant-query.ts` | Routes apply tenant filters manually. The helper exists but is not used — risk of developers missing tenant filters when adding new routes. |
| 5 | **Admin email is globally unique across tenants** | `app/api/tenants/onboard/route.ts` L166 | A staff member cannot register at two different clinics with the same email. This may be intentional but limits multi-clinic staff. |

### Minor

| # | Issue | Location |
|---|---|---|
| 6 | `ROOT_DOMAIN` not in `lib/env-validation.ts` required list | `lib/env-validation.ts` |
| 7 | `COOKIE_DOMAIN` not validated — missing it in production means sessions don't share across subdomains | `app/lib/dal.ts` |
| 8 | No tenant context injected into `components/` — client components that need tenant info must re-fetch via API | Architecture |

---

## 15. Key File Reference

| File | Purpose |
|---|---|
| [`lib/tenant.ts`](../lib/tenant.ts) | `extractSubdomain`, `getTenantContext`, `getTenantId`, `verifyTenant` |
| [`lib/tenant-query.ts`](../lib/tenant-query.ts) | `addTenantFilter`, `createTenantQuery`, `ensureTenantId` helpers |
| [`models/Tenant.ts`](../models/Tenant.ts) | Tenant schema — subdomain, settings, subscription |
| [`models/Settings.ts`](../models/Settings.ts) | Per-tenant settings singleton |
| [`app/lib/dal.ts`](../app/lib/dal.ts) | Session creation/verification — `tenantId` in JWT, `COOKIE_DOMAIN` usage |
| [`app/(app)/layout.tsx`](../app/(app)/layout.tsx) | Tenant guard — renders `TenantNotFound` for unknown subdomains |
| [`app/api/tenants/onboard/route.ts`](../app/api/tenants/onboard/route.ts) | Self-service clinic registration API |
| [`app/api/tenants/public/route.ts`](../app/api/tenants/public/route.ts) | Public tenant lookup (login page, onboarding form) |
| [`app/api/subscription/`](../app/api/subscription/) | PayPal billing, subscription status, usage |
| [`lib/storage-tracking.ts`](../lib/storage-tracking.ts) | Per-tenant storage usage calculation |
| [`proxy.ts`](../proxy.ts) | Edge middleware (CSRF, cron auth, security headers) — **not yet wired** |
| [`scripts/onboard-tenant.ts`](../scripts/onboard-tenant.ts) | CLI onboarding wizard |
| [`scripts/delete-tenant.ts`](../scripts/delete-tenant.ts) | CLI tenant deletion |

---

*Generated from source code — 2026-04-04*

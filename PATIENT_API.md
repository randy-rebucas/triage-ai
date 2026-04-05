# Patient API Documentation

**Base path:** `/api/patients`
**Last updated:** 2026-04-05

This document covers every patient-facing API endpoint — authentication, self-service portal data, public registration, and third-party app integration. Staff-only CRUD endpoints (e.g. `GET /api/patients`, `DELETE /api/patients/[id]`) are documented in the Staff API docs.

---

## Table of Contents

1. [Authentication Overview](#1-authentication-overview)
2. [Rate Limiting](#2-rate-limiting)
3. [Authentication Endpoints](#3-authentication-endpoints)
   - [POST /api/patients/auth/login](#31-post-apipatientsauthlogin) — Email + password (cookie)
   - [POST /api/patients/auth/otp/request](#32-post-apipatientsauthotprequest) — Request OTP via SMS
   - [POST /api/patients/auth/otp/verify](#33-post-apipatientsauthotpverify) — Verify OTP (cookie)
   - [POST /api/patients/auth/token](#34-post-apipatientsauthtoken) — Issue Bearer token (third-party apps)
   - [POST /api/patients/auth/setup-credentials](#35-post-apipatientsauthsetup-credentials) — Set email + password
   - [POST /api/patients/qr-login](#36-post-apipatientsqr-login) — QR code login
   - [GET /api/patients/session](#37-get-apipatientssession) — Get session + clinical data
   - [DELETE /api/patients/session](#38-delete-apipatientssession) — Logout
4. [Public Endpoints](#4-public-endpoints)
   - [POST /api/patients/public](#41-post-apipatientspublic) — Self-registration
   - [GET /api/patients/lookup](#42-get-apipatientslookup) — Patient lookup for third-party apps
5. [Patient Portal — Self-Service](#5-patient-portal--self-service)
   - [GET /api/patients/me](#51-get-apipatientsme) — Get own profile
   - [PATCH /api/patients/me](#52-patch-apipatientsme) — Update own profile
   - [POST /api/patients/me/change-password](#53-post-apipatientsmechange-password)
   - [GET /api/patients/me/visits](#54-get-apipatientsmevisits)
   - [GET /api/patients/me/visits/[id]](#55-get-apipatientsmevisitsid)
   - [GET /api/patients/me/prescriptions](#56-get-apipatientsmeprescriptions)
   - [GET /api/patients/me/lab-results](#57-get-apipatientsmelab-results)
   - [GET /api/patients/me/invoices](#58-get-apipatientsmeinvoices)
   - [GET /api/patients/me/documents](#59-get-apipatientsmedocuments)
   - [GET /api/patients/me/notifications](#510-get-apipatientsmenotifications)
   - [PATCH /api/patients/me/notifications](#511-patch-apipatientsmenotifications)
6. [Patient Appointments (Portal)](#6-patient-appointments-portal)
   - [GET /api/patients/appointments](#61-get-apipatientsappointments)
   - [POST /api/patients/appointments](#62-post-apipatientsappointments)
   - [DELETE /api/patients/appointments/[id]](#63-delete-apipatientsappointmentsid)
7. [Response Format](#7-response-format)
8. [Error Reference](#8-error-reference)
9. [Data Models](#9-data-models)

---

## 1. Authentication Overview

Patient portal routes accept credentials via **two carriers** — choose the one appropriate for the client type:

| Carrier | Header / Cookie | Issued by | TTL | Best for |
|---|---|---|---|---|
| `patient_session` cookie | `Cookie: patient_session=<jwt>` | `/auth/login`, `/auth/otp/verify`, `/qr-login` | 7 days | Browser / web portal |
| Bearer token | `Authorization: Bearer <jwt>` | `/auth/token` | 30 days | Third-party apps, mobile apps |

Both carriers carry the **same HS256 JWT payload** signed with `SESSION_SECRET`. All protected routes (`/me/*`, `/appointments`, `/session`) accept either one — the cookie is checked first, then the Authorization header.

### JWT payload structure

```json
{
  "patientId": "664abc...",
  "patientCode": "CLINIC-0001",
  "type": "patient",
  "email": "jane@example.com",
  "iat": 1712000000,
  "exp": 1712604800
}
```

### Login flow — web portal (cookie-based)

```
Choose one:
  ┌──────────────────┐    ┌──────────────────────┐    ┌───────────────────────────────┐
  │  QR code scan    │    │  Email + password     │    │  Phone OTP                    │
  │  POST /qr-login  │    │  POST /auth/login     │    │  POST /auth/otp/request       │
  └────────┬─────────┘    └──────────┬────────────┘    │  POST /auth/otp/verify        │
           │                         │                  └──────────────┬────────────────┘
           └─────────────────────────┴──────────────────────────────┘
                                     │
                           patient_session cookie set
                                     │
                    GET /api/patients/me/* (cookie auto-sent by browser)
```

### Login flow — third-party app (Bearer token)

```
1. GET  /api/patients/lookup?tenantId=…&phone=…      ← confirm patient exists + get authMethods
2a. POST /api/patients/auth/token  { method:"password", email, password, tenantId }
2b. POST /api/patients/auth/otp/request { phone, tenantId }
    POST /api/patients/auth/token  { method:"otp", phone, otp, tenantId }
                                     │
                           { token, expiresIn } returned in JSON body
                                     │
    GET /api/patients/me             ← Authorization: Bearer <token>
```

### First-time credential setup (no password yet)

```
Patient has QR card but no email/password:

1. POST /api/patients/auth/otp/request  { phone, tenantId }
2. POST /api/patients/auth/token        { method:"otp", phone, otp, tenantId }
   → receive Bearer token
3. POST /api/patients/auth/setup-credentials  (Bearer token in header)
   { email: "jane@example.com", password: "SecurePass123" }
   → credentials saved; patient can now use email+password on all future logins
```

---

## 2. Rate Limiting

| Endpoint group | Limiter | Window | Max requests |
|---|---|---|---|
| Auth endpoints (`/auth/*`, `/qr-login`) | `auth` | 15 min | 5 |
| `/auth/token` | `auth` | 15 min | 5 |
| `/patients/lookup` | `public` | 15 min | 10 |
| Public registration (`/public`) | `public` | 1 min | 20 |
| Portal data (`/me/*`, `/appointments`) | None (session-gated) | — | — |

**429 response:**
```json
{
  "success": false,
  "error": "Too many authentication attempts, please try again later",
  "retryAfter": 843
}
```
Headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 3. Authentication Endpoints

### 3.1 POST /api/patients/auth/login

Email + password login. Issues a `patient_session` cookie on success.

**Auth required:** No  
**Rate limited:** Yes (auth limiter)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Patient's registered email address |
| `password` | string | Yes | Plain-text password (bcrypt-compared) |
| `tenantId` | string | No | MongoDB ObjectId of the clinic. Scopes the lookup to a specific tenant when a patient is registered at multiple clinics. |

```json
{
  "email": "jane.doe@example.com",
  "password": "MySecurePass123",
  "tenantId": "664abc123def456789000001"
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "patientId": "664abc...",
    "patientCode": "CLINIC-0001",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com"
  }
}
```
Cookie set: `patient_session` (HttpOnly, 7 days)

**Error responses:**

| Status | Condition | Error message |
|---|---|---|
| 400 | Missing email or password | `"Email and password are required"` |
| 401 | Wrong credentials | `"Invalid email or password"` |
| 401 | Account has no password set | `"This account does not have a password set..."`, `code: "NO_PASSWORD"` |
| 403 | Account is inactive | `"Patient account is inactive. Please contact the clinic."` |
| 429 | Rate limit exceeded | `"Too many authentication attempts..."` |

> **Note:** When `code: "NO_PASSWORD"` is returned, redirect the patient to QR or OTP login. Use `POST /api/patients/me/change-password` to set an initial password after any successful login.

---

### 3.2 POST /api/patients/auth/otp/request

Generates a 6-digit OTP, hashes it, stores it with a 5-minute expiry, and sends it to the patient's registered phone via SMS (Twilio).

**Auth required:** No  
**Rate limited:** Yes (auth limiter)  
**Security:** Always returns the same success message regardless of whether the phone number exists (prevents enumeration).

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `phone` | string | Yes | Phone number in any format. Auto-normalized to E.164. |
| `tenantId` | string | No | Scope lookup to a specific clinic. |

```json
{
  "phone": "+63 917 123 4567",
  "tenantId": "664abc123def456789000001"
}
```

**Success response — 200** (always returned, even if phone not found):
```json
{
  "success": true,
  "message": "If a matching account is found, an OTP will be sent to your phone within 5 minutes."
}
```

**OTP behavior:**
- OTP is 6 digits, zero-padded
- Stored as bcrypt hash in `patient.otp` (select: false)
- Expiry: 5 minutes (`patient.otpExpiry`)
- Attempt counter reset to 0 on each new request
- Searches both `patient.phone` and `patient.contacts.phone`

---

### 3.3 POST /api/patients/auth/otp/verify

Verifies the OTP and issues a `patient_session` cookie.

**Auth required:** No  
**Rate limited:** Yes (auth limiter)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `phone` | string | Yes | Same number used in `/otp/request` |
| `otp` | string | Yes | 6-digit code received via SMS |
| `tenantId` | string | No | Same tenant used in `/otp/request` |

```json
{
  "phone": "+63 917 123 4567",
  "otp": "482916",
  "tenantId": "664abc123def456789000001"
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "patientId": "664abc...",
    "patientCode": "CLINIC-0001",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com"
  }
}
```
Cookie set: `patient_session` (HttpOnly, 7 days)

**Error responses:**

| Status | Condition | Error message |
|---|---|---|
| 400 | Missing phone or otp | `"Phone number and OTP are required"` |
| 401 | Wrong OTP or no OTP found | `"Invalid or expired OTP"` |
| 401 | OTP expired | `"OTP has expired. Please request a new one."` |
| 429 | 5+ wrong attempts | `"Too many incorrect attempts. Please request a new OTP."` |

**Attempt logic:**
- Each wrong OTP increments `patient.otpAttempts`
- At 5 failed attempts, OTP is invalidated and patient must request a new one
- On success, `otp`, `otpExpiry`, and `otpAttempts` are cleared from the document

---

### 3.4 POST /api/patients/auth/token

Issues a long-lived **Bearer token** in the response body for use by third-party and mobile applications. Supports two authentication methods selected via the `method` field.

Unlike `/auth/login` and `/auth/otp/verify`, this endpoint returns the JWT in the JSON response rather than setting a cookie. The third-party app stores the token securely and sends it as `Authorization: Bearer <token>` on subsequent requests.

**Auth required:** No  
**Rate limited:** Yes (auth limiter)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `method` | string | Yes | `"password"` or `"otp"` |
| `email` | string | Conditional | Required when `method = "password"` |
| `password` | string | Conditional | Required when `method = "password"` |
| `phone` | string | Conditional | Required when `method = "otp"` |
| `otp` | string | Conditional | Required when `method = "otp"`. Call `/auth/otp/request` first. |
| `tenantId` | string | No | Scopes the patient lookup to a specific clinic. |

**Example — password method:**
```json
{
  "method": "password",
  "email": "jane.doe@example.com",
  "password": "MySecurePass123",
  "tenantId": "664abc123def456789000001"
}
```

**Example — OTP method:**
```json
{
  "method": "otp",
  "phone": "+63 917 123 4567",
  "otp": "482916",
  "tenantId": "664abc123def456789000001"
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Authentication successful",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresIn": 2592000,
  "patient": {
    "id": "664abc...",
    "patientCode": "CLINIC-0001",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com"
  }
}
```

> `expiresIn` is in seconds. `2592000` = 30 days.

**Usage in subsequent requests:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

**Error responses:**

| Status | Condition | Error |
|---|---|---|
| 400 | Missing `method` or required fields | `"Invalid method. Use 'password' or 'otp'."` |
| 401 | Wrong email/password | `"Invalid email or password"` |
| 401 | No password set on account | `"This account has no password set..."`, `code: "NO_PASSWORD"` |
| 401 | Wrong or expired OTP | `"Invalid or expired OTP"` |
| 403 | Account inactive | `"Account is inactive. Please contact the clinic."` |
| 429 | Rate limit exceeded | — |

> When `code: "NO_PASSWORD"` is returned, use `method: "otp"` to log in, then call `/auth/setup-credentials` to set a password.

---

### 3.5 POST /api/patients/auth/setup-credentials

Registers or updates the email and password a patient uses to log into third-party applications. Requires an active session (cookie **or** Bearer token).

**Auth required:** Yes (cookie or Bearer token)  
**Rate limited:** No

**Typical use:**
- Patient first logs in via OTP to get a Bearer token, then calls this endpoint to register permanent credentials.
- Can also be used from the patient portal (web) to set/update third-party login credentials.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `password` | string | Yes | New password (min 8 characters) |
| `email` | string | No | Login email. If omitted, existing email is kept. |
| `currentPassword` | string | Conditional | Required if the patient already has a password set. |

```json
{
  "email": "jane.doe@example.com",
  "password": "NewSecurePass456",
  "currentPassword": "OldPass123"
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Credentials saved. You can now log in with email and password on any supported application.",
  "email": "jane.doe@example.com"
}
```

**Error responses:**

| Status | Condition | Error |
|---|---|---|
| 400 | `password` missing or < 8 chars | `"Password must be at least 8 characters long"` |
| 400 | `currentPassword` missing when one already exists | `"currentPassword is required when updating an existing password"` |
| 400 | Invalid email format | `"Invalid email format"` |
| 401 | `currentPassword` is wrong | `"Current password is incorrect"` |
| 403 | Account inactive | `"Account is inactive."` |
| 409 | Email already taken by another patient | `"This email is already registered to another patient..."` |

---

### 3.6 POST /api/patients/qr-login

Authenticates a patient by scanning their clinic-issued QR code.

**Auth required:** No  
**Rate limited:** Yes (auth limiter)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `qrCode` | string or object | Yes | JSON string or parsed object from the QR code |
| `tenantId` | string | No | Override tenant from body (falls back to QR data or subdomain) |

**Expected QR code payload** (JSON-encoded string):
```json
{
  "type": "patient_login",
  "patientId": "664abc...",
  "patientCode": "CLINIC-0001",
  "tenantId": "664abc123def456789000001"
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "patientId": "664abc...",
    "patientCode": "CLINIC-0001",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com"
  }
}
```

**Error responses:**

| Status | Condition | Error message |
|---|---|---|
| 400 | No QR code provided | `"QR code is required"` |
| 400 | Malformed JSON | `"Invalid QR code format"` |
| 400 | Missing patient identifier | `"Patient identification not found in QR code"` |
| 400 | Wrong QR type | `"Invalid QR code type. This QR code is not for patient login."` |
| 403 | Inactive patient | `"Patient account is inactive. Please contact the clinic."` |
| 404 | Patient not found | `"Patient not found"` |

---

### 3.7 GET /api/patients/session

Returns the authenticated patient's profile and optionally their related clinical data in a single request.

**Auth required:** Yes (`patient_session` cookie **or** `Authorization: Bearer` header)

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `include` | string | Comma-separated list of data to include. Accepted values: `appointments`, `visits`, `prescriptions`, `labResults`, `invoices`, `documents`, `referrals`, `all` |

**Example:**
```
GET /api/patients/session?include=appointments,prescriptions
GET /api/patients/session?include=all
```

**Success response — 200:**
```json
{
  "success": true,
  "data": {
    "patient": {
      "_id": "664abc...",
      "patientCode": "CLINIC-0001",
      "firstName": "Jane",
      "lastName": "Doe",
      "dateOfBirth": "1990-05-15T00:00:00.000Z",
      "sex": "female",
      "email": "jane.doe@example.com",
      "phone": "+63 917 123 4567",
      "address": { "street": "123 Main St", "city": "Manila", "state": "NCR", "zipCode": "1000" },
      "emergencyContact": { "name": "John Doe", "phone": "+63 917 987 6543", "relationship": "Spouse" },
      "allergies": [],
      "medicalHistory": "",
      "preExistingConditions": [],
      "discountEligibility": {}
    },
    "appointments": [ /* up to 10, sorted by appointmentDate desc */ ],
    "visits": [ /* up to 10, sorted by date desc */ ],
    "prescriptions": [ /* up to 10, sorted by issuedAt desc */ ],
    "labResults": [ /* up to 10, sorted by orderDate desc */ ],
    "invoices": [ /* up to 10, sorted by createdAt desc */ ],
    "documents": [ /* up to 20, sorted by uploadDate desc — non-confidential only */ ],
    "referrals": [ /* up to 10, sorted by referredDate desc */ ]
  }
}
```

> **Tip:** For paginated data, use the dedicated `/me/*` endpoints instead.

---

### 3.8 DELETE /api/patients/session

Logs the patient out by clearing the `patient_session` cookie.

**Auth required:** No (works even with invalid/expired session)

**Success response — 200:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 4. Public Endpoints

### 4.1 POST /api/patients/public

Patient self-registration. No authentication required. Creates a new patient record.

**Auth required:** No  
**Rate limited:** Yes (public limiter — 20 req/min)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `firstName` | string | Yes | |
| `lastName` | string | Yes | |
| `phone` | string | Yes | |
| `dateOfBirth` | string | Yes | ISO 8601 date |
| `sex` | string | Yes | `"male"`, `"female"`, or `"other"` |
| `email` | string | No | If omitted, a placeholder email is auto-generated |
| `address` | object | Yes | `{ street, city, state, zipCode }` |
| `tenantId` | string | No | Associates patient with a clinic |
| `middleName` | string | No | |
| `suffix` | string | No | |
| `emergencyContact` | object | No | `{ name, phone, relationship }` |

**Success response — 201:**
```json
{
  "success": true,
  "message": "Patient registration successful. Your patient code is: CLINIC-0042",
  "data": { /* full patient document */ }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing required fields |
| 400 | Validation error (e.g. invalid email format, invalid sex value) |
| 409 | Duplicate email in same tenant |
| 503 | Database connection error |

---

### 4.2 GET /api/patients/lookup

Public endpoint for third-party applications. Confirms whether a patient exists in a specific clinic and returns **masked** identity data so the patient can verify their account. Also returns `authMethods` so the app knows which login form to render.

**Auth required:** No  
**Rate limited:** Yes (public limiter — 10 req / 15 min per IP)

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `tenantId` | string | Yes | MongoDB ObjectId of the clinic (from `/api/tenants/directory`) |
| `phone` | string | At least one required | Patient's registered phone number |
| `email` | string | At least one required | Patient's registered email address |
| `patientCode` | string | At least one required | Clinic-issued patient code (e.g. `CLINIC-0001`) |

Multiple identifiers can be sent together and are OR'd.

**Example:**
```
GET /api/patients/lookup?tenantId=664abc...&phone=%2B639171234567
GET /api/patients/lookup?tenantId=664abc...&email=jane%40example.com
GET /api/patients/lookup?tenantId=664abc...&patientCode=CLINIC-0001
```

**Success response — patient found (200):**
```json
{
  "success": true,
  "found": true,
  "patient": {
    "patientCode": "CLINIC-0001",
    "firstName": "Jane",
    "maskedLastName": "D***",
    "maskedEmail": "j***@example.com",
    "maskedPhone": "+63*****4567",
    "active": true
  },
  "authMethods": {
    "password": true,
    "otp": true
  }
}
```

**Response — patient not found (200):**
```json
{
  "success": false,
  "found": false
}
```

> The endpoint always returns HTTP 200 for both found and not-found cases to prevent patient enumeration.

**`authMethods` — what to show in the app UI:**

| `password` | `otp` | Recommended UI |
|---|---|---|
| `true` | `true` | Email+password form with "Login with OTP" option |
| `true` | `false` | Email+password form only |
| `false` | `true` | OTP form + link to set up credentials |
| `false` | `false` | "Contact your clinic to set up app access" |

**Error responses:**

| Status | Condition |
|---|---|
| 400 | `tenantId` missing or invalid format |
| 400 | None of `phone`, `email`, `patientCode` provided |

---

## 5. Patient Portal — Self-Service

All routes in this section require authentication via `patient_session` cookie **or** `Authorization: Bearer <token>` header. All return 401 if unauthenticated, 403 if the account is inactive.

---

### 5.1 GET /api/patients/me

Returns the complete patient profile of the currently authenticated patient.

**Auth required:** Yes (cookie or Bearer token)

**Success response — 200:**
```json
{
  "success": true,
  "data": {
    "_id": "664abc...",
    "patientCode": "CLINIC-0001",
    "tenantIds": ["664abc123def456789000001"],
    "firstName": "Jane",
    "middleName": "Marie",
    "lastName": "Doe",
    "suffix": null,
    "dateOfBirth": "1990-05-15T00:00:00.000Z",
    "sex": "female",
    "civilStatus": "married",
    "nationality": "Filipino",
    "occupation": "Engineer",
    "email": "jane.doe@example.com",
    "phone": "+63 917 123 4567",
    "address": {
      "street": "123 Main St",
      "city": "Manila",
      "state": "NCR",
      "zipCode": "1000"
    },
    "emergencyContact": {
      "name": "John Doe",
      "phone": "+63 917 987 6543",
      "relationship": "Spouse"
    },
    "identifiers": {
      "philHealth": "12-345678901-2",
      "govId": "A1234567"
    },
    "medicalHistory": "No significant history.",
    "preExistingConditions": [],
    "allergies": [],
    "discountEligibility": {},
    "active": true,
    "hasPassword": true,
    "createdAt": "2024-01-10T08:00:00.000Z",
    "updatedAt": "2024-04-01T10:30:00.000Z"
  }
}
```

> `password`, `otp`, `otpExpiry`, `otpAttempts` are **never** returned (schema `select: false`).  
> `hasPassword` is a derived boolean indicating whether the patient has a password set — useful for third-party app UIs to decide whether to show a "Set Password" prompt.

---

### 5.2 PATCH /api/patients/me

Updates the patient's own profile. Only safe fields are accepted; system and auth fields are silently stripped.

**Auth required:** Yes (cookie or Bearer token)

**Blocked fields** (silently ignored if sent): `patientCode`, `tenantIds`, `attachments`, `password`, `otp`, `otpExpiry`, `otpAttempts`, `active`, `_id`, `__v`, `createdAt`, `updatedAt`

**Updatable fields include:** `firstName`, `middleName`, `lastName`, `suffix`, `dateOfBirth`, `sex`, `civilStatus`, `nationality`, `occupation`, `email`, `phone`, `contacts`, `address`, `emergencyContact`, `identifiers`, `medicalHistory`, `allergies`, `socialHistory`, `familyHistory`

**Request body** (partial update — send only fields to change):
```json
{
  "phone": "+63 917 000 1111",
  "address": {
    "street": "456 New Ave",
    "city": "Quezon City",
    "state": "NCR",
    "zipCode": "1100"
  },
  "emergencyContact": {
    "name": "Mary Doe",
    "phone": "+63 917 555 6666",
    "relationship": "Sister"
  }
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { /* full updated patient document */ }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | All provided fields were blocked |
| 400 | Mongoose validation error (e.g. invalid email format) |
| 404 | Patient not found |

---

### 5.3 POST /api/patients/me/change-password

Sets or changes the patient's password. This is a self-service endpoint (requires current password when one is set).

> **Third-party app alternative:** Use `POST /api/patients/auth/setup-credentials` instead — it accepts a Bearer token and follows the same logic. Staff can also reset a patient's password via `POST /api/patients/[id]/app-credentials`.

**Auth required:** Yes (cookie or Bearer token)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `newPassword` | string | Yes | Min 8 characters |
| `currentPassword` | string | Conditional | Required only if a password already exists on the account |

```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewSecurePass456"
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

**Error responses:**

| Status | Condition | Error |
|---|---|---|
| 400 | `newPassword` missing or < 8 chars | `"New password must be at least 8 characters long"` |
| 400 | Account has password but `currentPassword` not provided | `"Current password is required"` |
| 401 | `currentPassword` is wrong | `"Current password is incorrect"` |

> **First-time password setup:** If the patient logs in via QR or OTP and has no password, calling this endpoint with only `newPassword` (no `currentPassword`) will set their password for the first time.

---

### 5.4 GET /api/patients/me/visits

Returns a paginated list of the patient's visit history.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Results per page (max 50) |
| `tenantId` | string | — | Filter to a specific clinic (multi-clinic patients) |

**Success response — 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "664abc...",
      "date": "2024-03-15T09:00:00.000Z",
      "type": "consultation",
      "chiefComplaint": "Headache",
      "diagnosis": "Tension headache",
      "provider": { "_id": "...", "firstName": "Dr. Juan", "lastName": "Cruz", "email": "dr.cruz@clinic.com" },
      "tenantId": "664abc123def456789000001"
    }
  ],
  "pagination": {
    "total": 24,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

---

### 5.5 GET /api/patients/me/visits/[id]

Returns the full detail of a single visit. Ownership is enforced — only visits belonging to the authenticated patient are returned.

**Auth required:** Yes

**URL params:** `id` — MongoDB ObjectId of the visit

**Success response — 200:**
```json
{
  "success": true,
  "data": { /* full visit document with provider populated */ }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 404 | Visit not found or does not belong to this patient |

---

### 5.6 GET /api/patients/me/prescriptions

Returns a paginated list of the patient's prescriptions.

**Auth required:** Yes

**Query parameters:** `page`, `limit` (max 50), `tenantId`

**Success response — 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "664abc...",
      "issuedAt": "2024-03-15T09:00:00.000Z",
      "status": "active",
      "medications": [
        { "name": "Amoxicillin", "dosage": "500mg", "frequency": "3x daily", "duration": "7 days" }
      ],
      "prescribedBy": { "firstName": "Dr. Juan", "lastName": "Cruz", "email": "..." }
    }
  ],
  "pagination": { "total": 5, "page": 1, "limit": 10, "totalPages": 1 }
}
```

---

### 5.7 GET /api/patients/me/lab-results

Returns a paginated list of the patient's lab results.

**Auth required:** Yes

**Query parameters:** `page`, `limit` (max 50), `tenantId`

**Success response — 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "664abc...",
      "testName": "Complete Blood Count",
      "status": "available",
      "orderDate": "2024-03-14T00:00:00.000Z",
      "results": { /* structured result data */ }
    }
  ],
  "pagination": { "total": 8, "page": 1, "limit": 10, "totalPages": 1 }
}
```

---

### 5.8 GET /api/patients/me/invoices

Returns a paginated list of the patient's invoices plus an outstanding balance summary.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | |
| `limit` | number | `10` | Max 50 |
| `status` | string | — | Filter by status: `paid`, `unpaid`, `partial`, `cancelled` |
| `tenantId` | string | — | Filter to a specific clinic |

**Success response — 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "664abc...",
      "invoiceNumber": "INV-000042",
      "total": 2500.00,
      "status": "partial",
      "payments": [{ "amount": 1000, "method": "cash", "date": "..." }],
      "createdAt": "2024-03-15T09:00:00.000Z"
    }
  ],
  "summary": {
    "outstandingBalance": 1500.00,
    "unpaidCount": 2
  },
  "pagination": { "total": 12, "page": 1, "limit": 10, "totalPages": 2 }
}
```

---

### 5.9 GET /api/patients/me/documents

Returns a paginated list of the patient's documents. **Confidential documents are always excluded.**

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | |
| `limit` | number | `20` | Max 50 |
| `category` | string | — | Filter by document category |
| `tenantId` | string | — | Filter to a specific clinic |

**Success response — 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "664abc...",
      "documentCode": "DOC-0001",
      "title": "Blood Test Results March 2024",
      "description": "CBC panel results",
      "category": "lab",
      "documentType": "pdf",
      "filename": "cbc-march-2024.pdf",
      "size": 204800,
      "uploadDate": "2024-03-16T08:00:00.000Z"
    }
  ],
  "pagination": { "total": 6, "page": 1, "limit": 20, "totalPages": 1 }
}
```

> To download a document, use the staff-accessible `/api/documents/[id]/download` endpoint (requires staff authentication).

---

### 5.10 GET /api/patients/me/notifications

Returns a patient-centric notification feed derived from recent clinical activity (appointments, lab results, invoices, prescriptions) from the last 90 days.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | |
| `limit` | number | `20` | Max 50 |
| `unreadOnly` | boolean | `false` | Return only unread notifications |

**Success response — 200:**
```json
{
  "success": true,
  "unreadCount": 3,
  "data": [
    {
      "id": "apt-664abc...",
      "type": "appointment",
      "title": "Appointment Confirmed",
      "message": "Your appointment on Mon, Apr 7 at 09:00 has been confirmed.",
      "date": "2024-04-05T14:30:00.000Z",
      "read": false,
      "actionUrl": "/patient/portal?tab=appointments",
      "metadata": { "appointmentCode": "APT-000042", "status": "confirmed" }
    },
    {
      "id": "lab-664abc...",
      "type": "lab_result",
      "title": "Lab Result Requires Attention",
      "message": "Your CBC result is abnormal. Please contact your doctor.",
      "date": "2024-04-04T11:00:00.000Z",
      "read": false,
      "actionUrl": "/patient/portal?tab=lab-results",
      "metadata": { "testName": "Complete Blood Count", "status": "abnormal" }
    },
    {
      "id": "inv-664abc...",
      "type": "invoice",
      "title": "Outstanding Balance",
      "message": "Invoice #INV-000042 has an outstanding balance of 1500.",
      "date": "2024-04-01T09:00:00.000Z",
      "read": true,
      "actionUrl": "/patient/portal?tab=invoices",
      "metadata": { "invoiceNumber": "INV-000042", "total": 2500, "status": "partial" }
    }
  ],
  "pagination": { "total": 7, "page": 1, "limit": 20, "totalPages": 1 }
}
```

**Notification ID format:**

| Prefix | Source |
|---|---|
| `apt-{id}` | Appointment |
| `lab-{id}` | Lab result |
| `inv-{id}` | Invoice |
| `rx-{id}` | Prescription |

**Notification types and triggers:**

| Type | Trigger conditions |
|---|---|
| `appointment` | Status is `confirmed`, `cancelled`, `pending`, or `scheduled`; updated in last 90 days |
| `lab_result` | Status is `available`, `abnormal`, or `critical`; updated in last 90 days |
| `invoice` | Status is `unpaid` or `partial` (no time restriction — always shown until resolved) |
| `prescription` | Created in last 90 days |

---

### 5.11 PATCH /api/patients/me/notifications

Marks one or more notifications as read.

**Auth required:** Yes

**Option A — Mark specific notifications:**
```json
{
  "ids": ["apt-664abc...", "lab-664abc..."]
}
```

**Option B — Mark all as read:**
```json
{
  "markAllRead": true
}
```

**Success response — 200:**
```json
{
  "success": true,
  "message": "2 notification(s) marked as read"
}
```
or
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Neither `ids` array nor `markAllRead: true` provided |
| 400 | `ids` is empty |

> **How read-state works:** IDs are stored in `patient.readNotificationIds` (a string array on the Patient document). The GET endpoint cross-references this list. `markAllRead` clears the list, so the next GET will correctly recalculate unread state from freshly derived notifications.

---

## 6. Patient Appointments (Portal)

### 6.1 GET /api/patients/appointments

Returns available doctors and optionally available time slots for a given date and doctor.

**Auth required:** Yes (`patient_session` cookie)

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `date` | string | ISO 8601 date. If provided with `doctorId`, returns available slots. |
| `doctorId` | string | MongoDB ObjectId of the doctor |

**Example:**
```
GET /api/patients/appointments
GET /api/patients/appointments?date=2024-04-10&doctorId=664abc...
```

**Success response (no date/doctorId) — 200:**
```json
{
  "success": true,
  "data": {
    "doctors": [
      { "_id": "664abc...", "firstName": "Juan", "lastName": "Cruz", "specialization": "General Medicine", "schedule": {} }
    ]
  }
}
```

**Success response (with date + doctorId) — 200:**
```json
{
  "success": true,
  "data": {
    "doctors": [ /* same as above */ ],
    "availableSlots": ["09:00", "09:30", "10:00", "11:30", "14:00"]
  }
}
```

> Time slots are 30-minute intervals between 09:00 and 17:00. Already-booked slots are excluded.

---

### 6.2 POST /api/patients/appointments

Books an appointment for the authenticated patient.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `doctorId` | string | Yes | MongoDB ObjectId |
| `appointmentDate` | string | Yes | ISO 8601 date |
| `appointmentTime` | string | Yes | Format: `HH:mm` (24-hour) |
| `reason` | string | No | Max 500 characters |

```json
{
  "doctorId": "664abc...",
  "appointmentDate": "2024-04-10",
  "appointmentTime": "10:30",
  "reason": "Annual check-up"
}
```

**Success response — 201:**
```json
{
  "success": true,
  "message": "Appointment request submitted successfully. You will receive a confirmation shortly.",
  "data": { /* full appointment document with patient and doctor populated */ }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing required fields |
| 400 | Invalid date or time format |
| 404 | Doctor not found in patient's tenant |
| 409 | Time slot already taken by another patient |
| 409 | Patient already has an appointment at this time |

> Appointments are created with `status: "pending"` and must be confirmed by clinic staff. An SMS confirmation is sent to the patient's phone.

---

### 6.3 DELETE /api/patients/appointments/[id]

Cancels an appointment belonging to the authenticated patient.

**Auth required:** Yes

**URL params:** `id` — MongoDB ObjectId of the appointment

**Constraints:**
- Only the patient who booked the appointment can cancel it
- Cannot cancel appointments that are already `completed` or `cancelled`
- Cannot cancel past appointments

**Success response — 200:**
```json
{
  "success": true,
  "message": "Appointment cancelled successfully"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 403 | Appointment does not belong to this patient |
| 404 | Appointment not found |
| 409 | Appointment cannot be cancelled (wrong status or past date) |

---

## 7. Response Format

All responses follow this consistent shape:

**Success:**
```json
{
  "success": true,
  "data": { /* payload */ },
  "message": "Optional human-readable message"
}
```

**Paginated success:**
```json
{
  "success": true,
  "data": [ /* array of items */ ],
  "pagination": {
    "total": 100,
    "page": 2,
    "limit": 10,
    "totalPages": 10
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

---

## 8. Error Reference

| HTTP Status | Meaning |
|---|---|
| 400 | Bad request — validation error or missing field |
| 401 | Unauthenticated — missing or invalid `patient_session` cookie |
| 403 | Forbidden — account inactive, or resource not owned by patient |
| 404 | Resource not found |
| 409 | Conflict — duplicate record or scheduling conflict |
| 429 | Rate limit exceeded |
| 500 | Server error |
| 503 | Database unavailable |

---

## 9. Data Models

### Patient Session JWT payload

```typescript
{
  patientId: string;       // MongoDB ObjectId
  patientCode: string;     // e.g. "CLINIC-0001"
  type: "patient";         // always "patient"
  email: string;
  iat: number;             // issued at (UNIX)
  exp: number;             // expires at (UNIX)
                           //   cookie: 7 days  (issued by /auth/login, /auth/otp/verify, /qr-login)
                           //   Bearer: 30 days (issued by /auth/token)
}
```

Both carriers use the same payload shape and signing key (`SESSION_SECRET`). All protected endpoints accept either one.

### Patient document (relevant fields)

```typescript
{
  _id: ObjectId;
  tenantIds: ObjectId[];         // clinics this patient belongs to
  patientCode: string;           // e.g. "CLINIC-0001"
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: Date;
  sex: "male" | "female" | "other";
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  email?: string;
  phone: string;
  address: { street: string; city: string; state: string; zipCode: string };
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
  identifiers?: { philHealth?: string; govId?: string };
  medicalHistory?: string;
  preExistingConditions?: Array<{ condition: string; status: "active"|"resolved"|"chronic" }>;
  allergies?: Array<string | { substance: string; reaction: string; severity: string }>;
  discountEligibility?: { pwd?: {...}; senior?: {...}; membership?: {...} };
  active?: boolean;
  // Auth fields — never returned in responses (select: false)
  password?: string;
  otp?: string;
  otpExpiry?: Date;
  otpAttempts?: number;
  // Notification read-state tracking
  readNotificationIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Notification object

```typescript
{
  id: string;                          // e.g. "apt-664abc...", "lab-664abc..."
  type: "appointment" | "lab_result" | "invoice" | "prescription";
  title: string;
  message: string;
  date: Date;
  read: boolean;
  actionUrl?: string;                  // e.g. "/patient/portal?tab=appointments"
  metadata?: Record<string, any>;     // type-specific fields (appointmentCode, status, etc.)
}
```

---

### Staff credential management

Staff can set or reset a patient's app credentials without knowing the existing password via a dedicated staff endpoint:

| Method | Endpoint | Permission required |
|---|---|---|
| `GET` | `/api/patients/[id]/app-credentials` | `patients → read` |
| `POST` | `/api/patients/[id]/app-credentials` | `patients → write` |

**GET** returns `{ hasPassword: boolean, email: string | null }`.

**POST** body: `{ password: string (min 8), email?: string }` — admin override, no current password required.

These endpoints use staff session authentication (`verifySession` + `requirePermission`), not patient auth.

---

*Generated from source code — `app/api/patients/` — 2026-04-05*

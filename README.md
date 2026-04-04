# ClinicAI — AI-Powered Clinic Management System

A production-grade Clinic Management System with an intelligent AI Triage Engine, built with Next.js 15, MongoDB, and OpenAI GPT-4o.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes (Node.js) |
| Database | MongoDB + Mongoose |
| AI Engine | OpenAI GPT-4o (modular prompt architecture) |
| Auth | JWT (jsonwebtoken + jose for Edge) |
| Validation | Zod |

---

## Project Structure

```
src/
├── app/                          # Next.js App Router pages & API routes
│   ├── api/                      # REST API endpoints
│   │   ├── auth/                 # login, register, logout, me
│   │   ├── triage/               # start, answer, validate, pending
│   │   ├── patients/             # list, detail, profile
│   │   └── records/              # clinical records CRUD
│   ├── (auth)/                   # Login & Register pages
│   ├── patient/                  # Patient portal
│   │   ├── dashboard/
│   │   ├── triage/               # AI symptom chat
│   │   └── reports/              # Assessment history
│   └── doctor/                   # Doctor dashboard
│       ├── dashboard/            # Pending reviews + stats
│       ├── patients/             # Patient list & detail
│       ├── triage/[sessionId]/   # Triage review & validation
│       └── records/[recordId]/   # Clinical record detail
├── components/
│   ├── ui/                       # Shared UI (Button, Card, Badge, Input, Alert)
│   ├── layout/                   # Navbar
│   ├── patient/                  # SymptomChat, ReportCard
│   └── doctor/                   # TriageReview, DiagnosisForm
├── lib/
│   ├── ai/                       # OpenAI client + modular prompts
│   │   ├── prompts/              # questioning, riskScoring, reportGeneration
│   │   └── triageEngine.ts       # 3-stage AI pipeline
│   ├── api/                      # response helpers, withAuth middleware
│   ├── auth/                     # JWT (Node.js + Edge versions)
│   ├── db/                       # MongoDB singleton connection
│   └── validations/              # Zod schemas
├── models/                       # Mongoose models
│   ├── User.ts
│   ├── Patient.ts
│   ├── TriageSession.ts
│   ├── ClinicalRecord.ts
│   └── AuditLog.ts
├── services/                     # Business logic layer
│   ├── authService.ts
│   ├── triageService.ts
│   ├── patientService.ts
│   ├── recordService.ts
│   └── auditService.ts
├── types/                        # Central TypeScript interfaces
└── middleware.ts                 # Edge route protection
```

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd cms-triage-ai
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/cms-triage-ai
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
ENABLE_AUDIT_LOGS=true
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Core Features

### AI Triage Engine (3-Stage Pipeline)

```
Patient submits chief complaint
        ↓
[Stage 1] Adaptive Questioning
  - AI generates up to 8 clarifying questions
  - Questions adapt based on previous answers
  - Emergency keyword detection (synchronous, before AI)
        ↓
[Stage 2] Risk Scoring
  - AI scores 0-100 based on full conversation
  - 4 levels: Low (0-30), Medium (31-60), High (61-80), Critical (81-100)
  - Safety flags: warning / urgent / emergency
        ↓
[Stage 3] Report Generation
  - 2-5 possible conditions with ICD-10 codes
  - Clinical summary for doctor
  - Patient-safe recommendations
  - Medical disclaimer
```

### Patient Portal
- AI symptom chat (conversational interface)
- Real-time progress indicator
- Emergency safety alerts
- Assessment history with risk badges
- **Patients NEVER see diagnosis names** — only recommendations

### Doctor Dashboard
- Pending reviews sorted by risk score
- Critical case highlighting with alerts
- Full AI report with possible conditions + ICD-10
- Validation form (diagnosis, ICD-10, notes, AI agreement tracking)
- Patient profiles with medical history, allergies, records
- Clinical record creation with vitals, prescriptions, follow-up

### Compliance (PH DPA / RA 10173)
- Immutable AuditLog for all sensitive actions
- Role-based access control (patient / doctor / admin)
- JWT in httpOnly cookies (XSS protection)
- Security headers on all responses
- No patient diagnosis disclosure to non-medical users

---

## API Reference

### Auth
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Authenticated |
| GET | `/api/auth/me` | Authenticated |

### Triage
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/api/triage/start` | Patient |
| POST | `/api/triage/[id]/answer` | Patient |
| GET | `/api/triage/[id]` | Authenticated |
| POST | `/api/triage/[id]/validate` | Doctor |
| GET | `/api/triage/pending` | Doctor |

### Patients & Records
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/patients` | Doctor |
| GET | `/api/patients/[id]` | Doctor |
| GET/PATCH | `/api/patients/me` | Patient |
| GET/POST | `/api/records` | Doctor |
| GET/PATCH | `/api/records/[id]` | Authenticated |

All responses follow:
```json
{ "status": "success", "data": {...}, "message": "..." }
{ "status": "error", "error": "...", "code": "...", "details": {...} }
```

---

## Risk Level Reference

| Level | Score | Colour | Action |
|-------|-------|--------|--------|
| Low | 0–30 | Green | Routine consultation |
| Medium | 31–60 | Yellow | Within 24 hours |
| High | 61–80 | Orange | Within 2–4 hours |
| Critical | 81–100 | Red | Immediate / emergency care |

---

## Medical-Legal Disclaimer

> This system is a **clinical decision support tool**. All AI-generated assessments are for reference only and must be reviewed and validated by a licensed physician. The AI **never provides definitive diagnoses** — it generates "possible conditions" to assist doctor review. This system complies with the Philippine Data Privacy Act (RA 10173).

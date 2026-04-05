import { NextRequest } from "next/server";
import { patientGet, patientPatch } from "@/lib/api/patientApiClient";

// ─────────────────────────────────────────────────────────────────
// GET   /api/patients/me  →  proxy: GET  /api/patients/me  (external)
// PATCH /api/patients/me  →  proxy: PATCH /api/patients/me (external)
//
// Auth: patient_session cookie or Authorization: Bearer forwarded upstream.
// Response shape: { success, data: <patient document> } per PATIENT_API.md §5.1-5.2
// ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  return patientGet(req, "/api/patients/me", { forwardAuth: true });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  return patientPatch(req, "/api/patients/me", body, { forwardAuth: true });
}

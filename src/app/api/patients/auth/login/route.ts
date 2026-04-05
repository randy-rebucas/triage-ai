import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { checkAuthRateLimit, patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/auth/login  (proxy → external myclinicsoft API)
// Forwards email + password; relays patient_session cookie locally.
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const limited = checkAuthRateLimit(req, "login");
  if (limited) return limited;

  let body: { email?: string; password?: string; tenantId?: string };
  try { body = await req.json(); } catch { return patientError("Invalid request body"); }

  if (!body.email || !body.password) {
    return patientError("Email and password are required", 400);
  }

  return patientPost(req, "/api/patients/auth/login", body, { relayCookie: true });
}

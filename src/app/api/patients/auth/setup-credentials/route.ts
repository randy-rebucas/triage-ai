import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/auth/setup-credentials  (proxy → external API)
// Auth required: patient_session cookie OR Bearer token.
// Forwards the caller's credentials to the external API.
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let body: { email?: string; password?: string; currentPassword?: string };
  try { body = await req.json(); } catch { return patientError("Invalid request body"); }

  if (!body.password) return patientError("Password is required", 400);

  return patientPost(req, "/api/patients/auth/setup-credentials", body, { forwardAuth: true });
}

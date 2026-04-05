import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { checkAuthRateLimit, patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/auth/otp/verify  (proxy → external API)
// Verifies OTP; relays patient_session cookie locally on success.
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const limited = checkAuthRateLimit(req, "otp-verify");
  if (limited) return limited;

  let body: { phone?: string; otp?: string; tenantId?: string };
  try { body = await req.json(); } catch { return patientError("Invalid request body"); }

  if (!body.phone || !body.otp) {
    return patientError("Phone number and OTP are required", 400);
  }

  return patientPost(req, "/api/patients/auth/otp/verify", body, { relayCookie: true });
}

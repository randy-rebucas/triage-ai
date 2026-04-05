import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { checkAuthRateLimit, patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/auth/otp/request  (proxy → external API)
// Always returns the same success message (enumeration-safe).
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const limited = checkAuthRateLimit(req, "otp-request");
  if (limited) return limited;

  let body: { phone?: string; tenantId?: string };
  try { body = await req.json(); } catch { return patientError("Invalid request body"); }

  if (!body.phone) return patientError("Phone number is required", 400);

  return patientPost(req, "/api/patients/auth/otp/request", body);
}

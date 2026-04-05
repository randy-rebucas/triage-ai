import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { checkAuthRateLimit, patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/qr-login  (proxy → external API)
// QR code payload → patient_session cookie.
//
// Expected qrCode: { type:"patient_login", patientId, patientCode, tenantId }
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const limited = checkAuthRateLimit(req, "qr-login");
  if (limited) return limited;

  let body: { qrCode?: unknown; tenantId?: string };
  try { body = await req.json(); } catch { return patientError("Invalid request body"); }

  if (!body.qrCode) return patientError("QR code is required", 400);

  return patientPost(req, "/api/patients/qr-login", body, { relayCookie: true });
}

import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { checkAuthRateLimit, patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/auth/token  (proxy → external API)
// Issues a long-lived Bearer token for third-party / mobile apps.
// method: "password" | "otp"
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const limited = checkAuthRateLimit(req, "token");
  if (limited) return limited;

  let body: { method?: string; [key: string]: unknown };
  try { body = await req.json(); } catch { return patientError("Invalid request body"); }

  if (body.method !== "password" && body.method !== "otp") {
    return patientError("Invalid method. Use 'password' or 'otp'.", 400);
  }

  // No relayCookie — external returns JWT in the response body
  return patientPost(req, "/api/patients/auth/token", body);
}

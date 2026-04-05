import { NextRequest } from "next/server";
import { patientGet } from "@/lib/api/patientApiClient";
import { rateLimit, getClientIp, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { patientError } from "@/lib/api/patientResponse";

// ─────────────────────────────────────────────────────────────────
// GET /api/patients/lookup  (proxy → external API)
// Third-party: confirm patient exists + list authMethods.
// Rate limited: 10 req / 15 min.
// ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const ip     = getClientIp(req.headers);
  const result = rateLimit(`patient-lookup:${ip}`, 10, 15 * 60 * 1000);

  if (!result.allowed) {
    const res = patientError("Too many requests, please try again later", 429, {
      retryAfter: result.retryAfter,
    });
    applyRateLimitHeaders(res.headers, result);
    res.headers.set("Retry-After", String(result.retryAfter));
    return res;
  }

  const { searchParams } = req.nextUrl;
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) return patientError("tenantId is required", 400);

  // Forward all query params to external API unchanged
  const externalPath = `/api/patients/lookup?${searchParams.toString()}`;
  return patientGet(req, externalPath);
}

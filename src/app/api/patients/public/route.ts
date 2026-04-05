import { NextRequest } from "next/server";
import { patientPost } from "@/lib/api/patientApiClient";
import { rateLimit, getClientIp, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────
// POST /api/patients/public
//
// Proxies patient self-registration to the external myclinicsoft API.
// No auth required — this is the public registration endpoint.
//
// Rate limit: 5 requests / 15 min per IP (same as onboard)
// ─────────────────────────────────────────────────────────────────

const RATE_LIMIT     = 5;
const RATE_WINDOW_MS = 15 * 60 * 1_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`${ip}:patients:public`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!rl.allowed) {
    const res = NextResponse.json(
      { success: false, error: "Too many requests. Try again later.", retryAfter: rl.retryAfter },
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rl);
    res.headers.set("Retry-After", String(rl.retryAfter));
    return res;
  }

  let body: unknown;
  try { body = await req.json(); }
  catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const response = await patientPost(req, "/api/patients/public", body);
  applyRateLimitHeaders(response.headers, rl);
  return response;
}

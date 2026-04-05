import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, applyRateLimitHeaders } from "@/lib/api/rate-limit";

// ─────────────────────────────────────────────────────────────────
// POST /api/tenants/onboard
//
// Thin proxy to the external myclinicsoft API for clinic registration.
// Rate-limited locally (5 req / 15 min per IP) before forwarding.
// ─────────────────────────────────────────────────────────────────

const RATE_LIMIT     = 5;
const RATE_WINDOW_MS = 15 * 60 * 1_000;

const EXTERNAL_BASE =
  (process.env.MYCLINICSOFT_API_URL ?? "https://www.myclinicsoft.solutions")
    .replace(/\/$/, "");

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`${ip}:onboard`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!rl.allowed) {
    const res = NextResponse.json(
      { success: false, error: "Too many requests. Try again in 15 minutes.", retryAfter: rl.retryAfter },
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rl);
    res.headers.set("Retry-After", String(rl.retryAfter));
    return res;
  }

  let body: unknown;
  try { body = await req.json(); }
  catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  let externalRes: Response;
  try {
    externalRes = await fetch(`${EXTERNAL_BASE}/api/tenants/onboard`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[POST /api/tenants/onboard] External API error", err);
    return NextResponse.json(
      { success: false, error: "Registration service unavailable. Please try again." },
      { status: 503 }
    );
  }

  let responseBody: unknown;
  try { responseBody = await externalRes.json(); }
  catch { responseBody = { success: false, error: "Unexpected response from registration service" }; }

  const res = NextResponse.json(responseBody, { status: externalRes.status });
  applyRateLimitHeaders(res.headers, rl);
  return res;
}

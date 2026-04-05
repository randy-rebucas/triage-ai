import { NextResponse } from "next/server";
import { rateLimit, getClientIp, applyRateLimitHeaders } from "./rate-limit";

// ─────────────────────────────────────────────────────────────────
// Patient API response helpers
// Uses { success, data?, message?, error? } shape per PATIENT_API.md
// ─────────────────────────────────────────────────────────────────

export function patientOk<T>(data?: T, message?: string, status = 200): NextResponse {
  return NextResponse.json({ success: true, ...(message && { message }), ...(data !== undefined && { data }) }, { status });
}

export function patientCreated<T>(data: T, message?: string): NextResponse {
  return patientOk(data, message, 201);
}

export function patientError(error: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

// ── Auth rate limiter — 5 req / 15 min ───────────────────────────
const AUTH_LIMIT  = 5;
const AUTH_WINDOW = 15 * 60 * 1000;

export function checkAuthRateLimit(req: { headers: Headers }, suffix = ""): NextResponse | null {
  const ip     = getClientIp(req.headers);
  const result = rateLimit(`patient-auth:${ip}:${suffix}`, AUTH_LIMIT, AUTH_WINDOW);

  if (!result.allowed) {
    const res = NextResponse.json(
      {
        success:    false,
        error:      "Too many authentication attempts, please try again later",
        retryAfter: result.retryAfter,
      },
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, result);
    res.headers.set("Retry-After", String(result.retryAfter));
    return res;
  }

  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { fetchTenantDirectory } from "@/lib/api/myclinicsoft-client";
import { rateLimit, getClientIp, applyRateLimitHeaders } from "@/lib/api/rate-limit";

// ─────────────────────────────────────────────────────────────────
// GET /api/tenants/directory
//
// Proxies to the external MyClinicSoft tenant registry:
//   GET https://www.myclinicsoft.solutions/api/tenants/directory
//
// Returns an empty list when the external registry is unreachable
// rather than propagating a 5xx error to the client.
//
// Rate limit: 100 requests / minute per IP
// Auth required: No
// ─────────────────────────────────────────────────────────────────

const RATE_LIMIT     = 100;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`${ip}:directory`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!rl.allowed) {
    const res = NextResponse.json(
      { success: false, error: "Rate limit exceeded, please slow down", retryAfter: rl.retryAfter },
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rl);
    res.headers.set("Retry-After", String(rl.retryAfter));
    return res;
  }

  const { searchParams } = req.nextUrl;

  // fetchTenantDirectory never throws — it returns an empty list on error
  const data = await fetchTenantDirectory({
    search: searchParams.get("search") || undefined,
    city:   searchParams.get("city")   || undefined,
    page:   parseInt(searchParams.get("page")  || "1",  10) || 1,
    limit:  parseInt(searchParams.get("limit") || "20", 10) || 20,
  });

  const res = NextResponse.json(data);
  applyRateLimitHeaders(res.headers, rl);
  return res;
}

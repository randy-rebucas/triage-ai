import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";

// ─────────────────────────────────────────────────────────────────
// GET /api/tenants/validate?subdomain=<slug>
//
// Validates a clinic by subdomain — checks active status + subscription.
// Always returns HTTP 200; check the `valid` boolean in the body.
//
// Rate limit: 20 requests / minute per IP
// Auth required: No
// ─────────────────────────────────────────────────────────────────

const RATE_LIMIT     = 20;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`${ip}:validate`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!rl.allowed) {
    const res = NextResponse.json(
      { success: false, error: "Rate limit exceeded, please slow down", retryAfter: rl.retryAfter },
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rl);
    res.headers.set("Retry-After", String(rl.retryAfter));
    return res;
  }

  const subdomain = req.nextUrl.searchParams.get("subdomain")?.trim().toLowerCase();

  if (!subdomain) {
    const res = NextResponse.json({
      success: true,
      valid:   false,
      reason:  "missing_subdomain",
      message: "No subdomain was provided. Please include a subdomain query parameter.",
    });
    applyRateLimitHeaders(res.headers, rl);
    return res;
  }

  try {
    await connectDB();

    const tenant = await Tenant.findOne({ subdomain }).lean();

    if (!tenant) {
      const res = NextResponse.json({
        success: true,
        valid:   false,
        reason:  "not_found",
        message: `No clinic registered under "${subdomain}".`,
      });
      applyRateLimitHeaders(res.headers, rl);
      return res;
    }

    if (tenant.status !== "active") {
      const res = NextResponse.json({
        success: true,
        valid:   false,
        reason:  tenant.status === "suspended" ? "suspended" : "inactive",
        message: `This clinic is currently ${tenant.status}.`,
      });
      applyRateLimitHeaders(res.headers, rl);
      return res;
    }

    const sub  = tenant.subscription;
    const now  = new Date();
    const isExpired      = sub.expiresAt ? sub.expiresAt < now : false;
    const isActive       = sub.status === "active" && !isExpired;
    const isTrial        = !sub.plan || sub.plan === "trial";
    const daysRemaining  = sub.expiresAt
      ? Math.max(0, Math.ceil((sub.expiresAt.getTime() - now.getTime()) / 86_400_000))
      : null;

    const res = NextResponse.json({
      success: true,
      valid:   true,
      tenant: {
        id:          tenant._id.toString(),
        name:        tenant.name,
        displayName: tenant.displayName ?? tenant.name,
        subdomain:   tenant.subdomain,
        status:      tenant.status,
        city:        tenant.address?.city    ?? null,
        state:       tenant.address?.state   ?? null,
        country:     tenant.address?.country ?? null,
        logo:        tenant.settings?.logo   ?? null,
      },
      subscription: {
        plan:          sub.plan         ?? null,
        status:        sub.status       ?? null,
        billingCycle:  sub.billingCycle ?? null,
        isActive,
        isTrial,
        isExpired,
        expiresAt:     sub.expiresAt ? sub.expiresAt.toISOString() : null,
        daysRemaining,
      },
    });
    applyRateLimitHeaders(res.headers, rl);
    return res;
  } catch (err) {
    console.error("[GET /api/tenants/validate]", err);
    const res = NextResponse.json(
      { success: false, error: "Validation failed" },
      { status: 500 }
    );
    applyRateLimitHeaders(res.headers, rl);
    return res;
  }
}

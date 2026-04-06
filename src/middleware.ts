import { NextRequest, NextResponse } from "next/server";
import {
  extractPatientCookieToken,
  verifyPatientTokenEdge,
} from "@/lib/auth/jwtEdge";

// ─────────────────────────────────────────────────────────────────
// Next.js Edge Middleware — path-based multi-tenancy (patient portal)
//
// URL structure:
//   /{tenant}/login          → tenant login
//   /{tenant}/patient/*      → patient-only pages (requires patient_session)
//   /onboard                 → root-level clinic registration
//   /                        → landing / clinic directory
//   /api/*                   → API routes (pass-through)
// ─────────────────────────────────────────────────────────────────

// Path segments that are NOT tenant slugs
const RESERVED_PATHS = new Set([
  "api", "_next", "onboard", "favicon.ico", "static",
  "images", "icons", "fonts", "robots.txt", "sitemap.xml",
]);

const AUTH_SEGMENTS = new Set(["login"]);

const CSRF_EXEMPT_PATHS = [
  "/api/tenants/onboard",
  // Patient auth — no session cookie exists yet at these endpoints
  "/api/patients/auth/login",
  "/api/patients/auth/otp",
  "/api/patients/auth/token",
  "/api/patients/auth/setup-credentials",
  "/api/patients/qr-login",
  "/api/patients/session",
  "/api/patients/public",
  "/api/patients/lookup",
];

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Extract the tenant slug from the first path segment.
 * Returns null for reserved paths, root, and API routes.
 */
function extractTenantFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].toLowerCase();
  if (RESERVED_PATHS.has(first)) return null;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(first) && !/^[a-z0-9]$/.test(first)) return null;
  return first;
}

// ─── Security headers ─────────────────────────────────────────────
function addSecurityHeaders(res: NextResponse): NextResponse {
  const h = res.headers;
  h.set("X-Frame-Options", "DENY");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-XSS-Protection", "1; mode=block");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

function json(body: object, status: number): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Middleware ────────────────────────────────────────────────────
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // ── 1. Extract tenant from path ─────────────────────────────────
  const tenantSlug = extractTenantFromPath(pathname);

  // ── 2. CSRF protection (API routes with a patient session cookie) ─
  if (
    pathname.startsWith("/api/") &&
    CSRF_METHODS.has(method) &&
    !CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p))
  ) {
    const hasCookie = req.cookies.get("patient_session");
    if (hasCookie) {
      const origin  = req.headers.get("origin");
      const referer = req.headers.get("referer");

      // Require at least one of Origin or Referer for mutating requests
      if (!origin && !referer) {
        return json({ error: "CSRF validation failed" }, 403);
      }

      // Determine the effective origin to validate
      let effectiveOrigin = origin;
      if (!effectiveOrigin && referer) {
        try { effectiveOrigin = new URL(referer).origin; } catch { /* ignore */ }
      }

      if (effectiveOrigin) {
        const host       = req.headers.get("host") || "";
        const originHost = new URL(effectiveOrigin).hostname;
        const isLocalhost  = originHost === "localhost" || originHost === "127.0.0.1";
        const isSameHost   = originHost === host.split(":")[0];
        const rootDomain   = process.env.ROOT_DOMAIN || "";
        const isSubdomain  = rootDomain && (
          originHost === rootDomain || originHost.endsWith(`.${rootDomain}`)
        );
        if (!isSameHost && !isSubdomain && !isLocalhost) {
          return json({ error: "CSRF validation failed" }, 403);
        }
      }
    }
  }

  // ── 3. Pass-through for API routes — resolve tenant slug ─────────
  // Priority order:
  //   1. Referer header — browser always sets this to the originating
  //      page URL, so the slug is anchored to the page the user views.
  //   2. Client-supplied x-tenant-slug — fallback for clients that
  //      don't send Referer (privacy settings, curl, mobile apps).
  //      Accepted because the service layer enforces patient ownership,
  //      so spoofing the slug cannot grant cross-tenant access.
  if (pathname.startsWith("/api/") || !tenantSlug) {
    const requestHeaders = new Headers(req.headers);

    if (pathname.startsWith("/api/")) {
      // Try to derive from Referer first (preferred — browser-controlled)
      let resolvedSlug: string | null = null;
      const referer = req.headers.get("referer");
      if (referer) {
        try {
          resolvedSlug = extractTenantFromPath(new URL(referer).pathname);
        } catch { /* ignore malformed referer */ }
      }

      // Fall back to the client-provided header if Referer gave nothing
      if (!resolvedSlug) {
        resolvedSlug = req.headers.get("x-tenant-slug");
      }

      if (resolvedSlug) {
        requestHeaders.set("x-tenant-slug", resolvedSlug);
      } else {
        requestHeaders.delete("x-tenant-slug");
      }
    } else if (tenantSlug) {
      requestHeaders.set("x-tenant-slug", tenantSlug);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return addSecurityHeaders(res);
  }

  // ── 4. Tenant path — determine sub-path ─────────────────────────
  const subPath      = pathname.slice(tenantSlug.length + 1) || "/";
  const subParts     = subPath.split("/").filter(Boolean);
  const secondSegment = subParts[0] || "";

  const isAuthPage    = AUTH_SEGMENTS.has(secondSegment);
  const isPatientPage = secondSegment === "patient";

  const patientToken = extractPatientCookieToken(req.headers.get("cookie"));

  // ── 5. Redirect authenticated patients away from login ──
  if (isAuthPage && patientToken) {
    try {
      await verifyPatientTokenEdge(patientToken);
      return NextResponse.redirect(
        new URL(`/${tenantSlug}/patient/dashboard`, req.url)
      );
    } catch { /* expired — fall through to login */ }
  }

  // ── 6. Public pages (login, clinic landing) pass through ─
  if (!isPatientPage) {
    const res = NextResponse.next();
    res.headers.set("x-tenant-slug", tenantSlug);
    return addSecurityHeaders(res);
  }

  // ── 7. Patient-only pages — require valid patient_session ────────
  if (!patientToken) {
    const loginUrl = new URL(`/${tenantSlug}/login`, req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const patient = await verifyPatientTokenEdge(patientToken);
    const res = NextResponse.next();
    res.headers.set("x-tenant-slug",  tenantSlug);
    res.headers.set("x-patient-id",   patient.patientId);
    res.headers.set("x-patient-code", patient.patientCode);
    res.headers.set("x-user-role",    "patient");
    res.headers.set("x-user-email",   patient.email);
    return addSecurityHeaders(res);
  } catch {
    const loginUrl = new URL(`/${tenantSlug}/login`, req.url);
    loginUrl.searchParams.set("reason", "session_expired");
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("patient_session");
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

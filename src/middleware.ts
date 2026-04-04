import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge, extractCookieToken } from "@/lib/auth/jwtEdge";

// ─────────────────────────────────────────────────────────────────
// Next.js Edge Middleware — path-based multi-tenancy
//
// URL structure:
//   /{tenant}/login          → tenant login
//   /{tenant}/register       → tenant register
//   /{tenant}/patient/*      → patient pages  (role: patient)
//   /{tenant}/doctor/*       → doctor pages   (role: doctor|admin)
//   /onboard                 → root-level onboarding
//   /                        → landing
//   /api/*                   → API routes
//
// Middleware responsibilities:
//   1. Extract tenant slug from first path segment
//   2. Forward tenant slug as x-tenant-slug header to server components
//   3. CSRF protection on state-changing API requests
//   4. Cron / install route protection
//   5. Auth redirect for protected pages
//   6. Security headers on every response
// ─────────────────────────────────────────────────────────────────

// Path segments that are NOT tenant slugs
const RESERVED_PATHS = new Set([
  "api", "_next", "onboard", "favicon.ico", "static",
  "images", "icons", "fonts", "robots.txt", "sitemap.xml",
]);

const ROLE_PREFIXES: Record<string, string[]> = {
  "/patient": ["patient"],
  "/doctor": ["doctor", "admin"],
};

const AUTH_SEGMENTS = new Set(["login", "register"]);

const CSRF_EXEMPT_PATHS = [
  "/api/subscription/webhook",
  "/api/tenants/onboard",
  "/api/auth/login",
  "/api/auth/register",
];

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Extract the tenant slug from the first path segment.
 * Returns null for reserved paths, root, and API routes.
 *
 *   /clinic-a/patient/dashboard → "clinic-a"
 *   /api/auth/login             → null
 *   /onboard                    → null
 *   /                           → null
 */
function extractTenantFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].toLowerCase();
  if (RESERVED_PATHS.has(first)) return null;
  // Basic slug format check (same rules as subdomain)
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

  // ── 1. Cron route protection ────────────────────────────────────
  if (pathname.startsWith("/api/cron/")) {
    const cronSecret = process.env.CRON_SECRET;
    const isProd = process.env.NODE_ENV === "production";
    if (isProd && !cronSecret) return json({ error: "Unavailable" }, 503);
    if (isProd && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  // ── 2. Install route protection ────────────────────────────────
  if (pathname.startsWith("/api/install/")) {
    const installSecret = process.env.INSTALL_SECRET;
    const isProd = process.env.NODE_ENV === "production";
    if (isProd && !installSecret) return json({ error: "Forbidden" }, 403);
    if (isProd && req.headers.get("authorization") !== `Bearer ${installSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  // ── 3. Extract tenant from path ─────────────────────────────────
  const tenantSlug = extractTenantFromPath(pathname);

  // ── 4. CSRF protection (API routes with a session cookie) ───────
  if (
    pathname.startsWith("/api/") &&
    CSRF_METHODS.has(method) &&
    !CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p))
  ) {
    const hasCookie = req.cookies.get("session") || req.cookies.get("auth_token");
    if (hasCookie) {
      const origin = req.headers.get("origin");
      if (origin) {
        const host = req.headers.get("host") || "";
        const originHost = new URL(origin).hostname;
        const isLocalhost = originHost === "localhost" || originHost === "127.0.0.1";
        const isSameHost = originHost === host.split(":")[0];
        const rootDomain = process.env.ROOT_DOMAIN || "";
        const isSubdomain = rootDomain && (
          originHost === rootDomain || originHost.endsWith(`.${rootDomain}`)
        );
        if (!isSameHost && !isSubdomain && !isLocalhost) {
          return json({ error: "CSRF validation failed" }, 403);
        }
      }
    }
  }

  // ── 5. Pass-through for API and non-tenant paths ────────────────
  if (pathname.startsWith("/api/") || !tenantSlug) {
    const res = NextResponse.next();
    if (tenantSlug) res.headers.set("x-tenant-slug", tenantSlug);
    return addSecurityHeaders(res);
  }

  // ── 6. Tenant path — determine sub-path ─────────────────────────
  // Sub-path is everything after /{tenant}
  // e.g. /clinic-a/patient/dashboard → /patient/dashboard
  const subPath = pathname.slice(tenantSlug.length + 1) || "/";
  const subParts = subPath.split("/").filter(Boolean);
  const secondSegment = subParts[0] || "";

  // Auth pages: /{tenant}/login, /{tenant}/register
  const isAuthPage = AUTH_SEGMENTS.has(secondSegment);

  // Protected pages: /{tenant}/patient/*, /{tenant}/doctor/*
  const isProtected = secondSegment === "patient" || secondSegment === "doctor";

  const token = extractCookieToken(req.headers.get("cookie"));

  // Redirect authenticated users away from login/register
  if (isAuthPage && token) {
    try {
      const user = await verifyTokenEdge(token);
      const dest =
        user.role === "patient"
          ? `/${tenantSlug}/patient/dashboard`
          : `/${tenantSlug}/doctor/dashboard`;
      return NextResponse.redirect(new URL(dest, req.url));
    } catch {
      // expired token — let them through to login
    }
  }

  if (!isProtected) {
    const res = NextResponse.next();
    res.headers.set("x-tenant-slug", tenantSlug);
    return addSecurityHeaders(res);
  }

  // ── 7. Require auth for protected pages ─────────────────────────
  if (!token) {
    const loginUrl = new URL(`/${tenantSlug}/login`, req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  let user;
  try {
    user = await verifyTokenEdge(token);
  } catch {
    const loginUrl = new URL(`/${tenantSlug}/login`, req.url);
    loginUrl.searchParams.set("reason", "session_expired");
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("session");
    res.cookies.delete("auth_token");
    return res;
  }

  // ── 8. Role gate ─────────────────────────────────────────────────
  const requiredRoles = ROLE_PREFIXES[`/${secondSegment}`];
  if (requiredRoles && !requiredRoles.includes(user.role)) {
    const dest =
      user.role === "patient"
        ? `/${tenantSlug}/patient/dashboard`
        : `/${tenantSlug}/doctor/dashboard`;
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // ── 9. Forward user + tenant context to server components ────────
  const res = NextResponse.next();
  res.headers.set("x-tenant-slug", tenantSlug);
  res.headers.set("x-user-id", user.userId);
  res.headers.set("x-user-role", user.role);
  res.headers.set("x-user-email", user.email);
  if (user.tenantId) res.headers.set("x-tenant-id", user.tenantId);

  return addSecurityHeaders(res);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { cookies } from "next/headers";
import { fetchTenantValidation } from "@/lib/api/myclinicsoft-client";
import TenantNotFound from "@/components/TenantNotFound";
import TenantCookieSetter, { type TenantCachePayload } from "@/components/TenantCookieSetter";
import TenantBanner from "@/components/TenantBanner";
import { TenantProvider } from "@/context/TenantContext";

// ─────────────────────────────────────────────────────────────────
// [tenant] Root Layout — validation + cookie caching + context
//
// Flow:
//   1. Read tenant_v_{slug} cookie
//   2a. Cache hit  → build payload from cookie, skip API call
//   2b. Cache miss → call GET /api/tenants/validate (Axios)
//       → valid   → build full payload, TenantCookieSetter persists it
//       → invalid → TenantNotFound
//
//   3. Wrap children in <TenantProvider> so every client component
//      under /{tenant}/* can call useTenant() for free.
//
// Cookie TTL: CACHE_TTL_SECONDS (default 10 min)
// ─────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 600;
const COOKIE_PREFIX     = "tenant_v_";

interface Props {
  children: React.ReactNode;
  params:   Promise<{ tenant: string }>;
}

function readCachePayload(raw: string | undefined): TenantCachePayload | null {
  if (!raw) return null;
  try {
    const parsed: TenantCachePayload = JSON.parse(atob(raw));
    if (
      parsed.valid === true &&
      typeof parsed.exp === "number" &&
      parsed.exp > Date.now() &&
      // Guard against stale cookies that predate the subscription field
      typeof parsed.subscription === "object" &&
      parsed.subscription !== null &&
      typeof parsed.subscription.isActive === "boolean"
    ) {
      return parsed;
    }
  } catch {
    // malformed — fall through to API
  }
  return null;
}

export default async function TenantRootLayout({ children, params }: Props) {
  const { tenant: slug } = await params;

  // ── 1. Try cookie cache (server-readable) ─────────────────────
  const cookieStore = await cookies();
  const cached      = readCachePayload(cookieStore.get(`${COOKIE_PREFIX}${slug}`)?.value);

  if (cached) {
    return (
      <TenantProvider value={cached}>
        {/* Refresh TTL on every hit so active users stay warm */}
        <TenantCookieSetter payload={cached} ttlSeconds={CACHE_TTL_SECONDS} />
        <TenantBanner />
        {children}
      </TenantProvider>
    );
  }

  // ── 2. Cache miss — validate via Axios ────────────────────────
  const result = await fetchTenantValidation(slug);

  if (!result.valid) {
    return <TenantNotFound subdomain={slug} />;
  }

  const payload: TenantCachePayload = {
    valid:       true,
    exp:         Date.now() + CACHE_TTL_SECONDS * 1000,
    tenantId:    result.tenant.id,
    name:        result.tenant.name,
    displayName: result.tenant.displayName ?? result.tenant.name,
    subdomain:   result.tenant.subdomain,
    logo:        result.tenant.logo        ?? null,
    city:        result.tenant.city        ?? null,
    state:       result.tenant.state       ?? null,
    country:     result.tenant.country     ?? null,
    subscription: {
      plan:          result.subscription.plan          ?? null,
      status:        result.subscription.status        ?? null,
      billingCycle:  result.subscription.billingCycle  ?? null,
      isActive:      result.subscription.isActive,
      isTrial:       result.subscription.isTrial,
      isExpired:     result.subscription.isExpired,
      expiresAt:     result.subscription.expiresAt     ?? null,
      daysRemaining: result.subscription.daysRemaining ?? null,
    },
  };

  return (
    <TenantProvider value={payload}>
      {/* Sets tenant_v_{slug} cookie in the browser after first render */}
      <TenantCookieSetter payload={payload} ttlSeconds={CACHE_TTL_SECONDS} />
      <TenantBanner />
      {children}
    </TenantProvider>
  );
}

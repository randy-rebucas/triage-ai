import "server-only";
import { headers, cookies } from "next/headers";
import type { TenantContext } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Tenant Resolution — cookie-based (third-party API architecture)
//
// Tenants are managed by an external API (myclinicsoft).
// On every /{tenant}/* page load the layout calls
// fetchTenantValidation(slug) and caches the result in the
// browser cookie "tenant_v_{slug}" as base64(JSON(TenantCachePayload)).
//
// API routes read the tenantId from that cookie — no local Tenant
// MongoDB collection is required or used.
//
// Resolution chain for API routes:
//   1. Read x-tenant-slug header (set by middleware from URL or Referer)
//   2. Read tenant_v_{slug} cookie from the request
//   3. Base64-decode + JSON-parse → extract tenantId
// ─────────────────────────────────────────────────────────────────

const COOKIE_PREFIX = "tenant_v_";

interface CookiePayload {
  valid?:    boolean;
  exp?:      number;
  tenantId?: string;
  subdomain?: string;
  name?:     string;
  displayName?: string;
}

function parseCookiePayload(raw: string): CookiePayload | null {
  try {
    // atob is available in Node 16+ / Next.js 15 (Node 18+ required)
    const json = Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(json) as CookiePayload;
  } catch {
    return null;
  }
}

/**
 * Resolve the current tenant from the cached tenant cookie.
 * Returns { tenantId, subdomain, tenant: null } — tenant object
 * is not populated (it lives in TenantContext on the client).
 */
export async function getTenantContext(): Promise<TenantContext> {
  const headerStore = await headers();
  const slug        = headerStore.get("x-tenant-slug") || "";

  if (!slug) {
    console.warn("[getTenantContext] x-tenant-slug header is empty — tenant context unavailable");
    return { tenantId: null, subdomain: null, tenant: null };
  }

  const cookieStore = await cookies();
  const raw         = cookieStore.get(`${COOKIE_PREFIX}${slug}`)?.value;

  if (!raw) {
    console.warn(
      `[getTenantContext] No cookie "tenant_v_${slug}" found in request. ` +
      "The patient may need to visit the clinic page first to populate the tenant cache."
    );
    return { tenantId: null, subdomain: slug, tenant: null };
  }

  const payload = parseCookiePayload(raw);

  if (!payload) {
    console.warn(`[getTenantContext] Could not parse tenant cookie for slug "${slug}"`);
    return { tenantId: null, subdomain: slug, tenant: null };
  }

  if (!payload.valid) {
    console.warn(`[getTenantContext] Tenant cookie for "${slug}" has valid=false`);
    return { tenantId: null, subdomain: slug, tenant: null };
  }

  if (typeof payload.exp === "number" && payload.exp < Date.now()) {
    console.warn(`[getTenantContext] Tenant cookie for "${slug}" is expired (exp=${payload.exp})`);
    return { tenantId: null, subdomain: slug, tenant: null };
  }

  if (!payload.tenantId) {
    console.warn(`[getTenantContext] Tenant cookie for "${slug}" is missing tenantId field`);
    return { tenantId: null, subdomain: slug, tenant: null };
  }

  return {
    tenantId:  payload.tenantId,
    subdomain: slug,
    tenant:    null,
  };
}

/**
 * Convenience wrapper — returns the tenantId string or null.
 */
export async function getTenantId(): Promise<string | null> {
  const { tenantId } = await getTenantContext();
  return tenantId;
}

/**
 * Read the raw tenant slug from the x-tenant-slug header
 * without hitting any database. Useful for link generation.
 */
export async function getTenantSlug(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get("x-tenant-slug") || null;
}

/**
 * Assert the current request has a resolvable tenant.
 * Throws a descriptive error if not — use in routes that require tenant context.
 */
export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    throw new Error(
      "Tenant context is required but could not be resolved. " +
      "Ensure the tenant cookie is present and not expired."
    );
  }
  return tenantId;
}

/**
 * Extract tenant slug from a raw pathname string.
 * Edge-safe — no async, no cookies, no DB.
 */
export function extractSlugFromPath(pathname: string): string | null {
  const RESERVED = new Set([
    "api", "_next", "onboard", "favicon.ico", "static",
    "images", "icons", "fonts",
  ]);
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].toLowerCase();
  if (RESERVED.has(first)) return null;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(first) && !/^[a-z0-9]$/.test(first)) return null;
  return first;
}

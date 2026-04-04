import "server-only";
import { headers } from "next/headers";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import type { TenantContext, ITenant } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Tenant Resolution — path-based multi-tenancy
//
// The middleware extracts the tenant slug from the URL path
// (e.g. /clinic-a/patient/dashboard → slug = "clinic-a") and
// forwards it as the x-tenant-slug request header.
//
// Tenant data is resolved from the local MongoDB Tenant collection.
// The tenant _id is used as `tenantId` to scope all clinical data.
// ─────────────────────────────────────────────────────────────────

/**
 * Resolve the tenant from the x-tenant-slug header set by middleware.
 * Queries the local MongoDB Tenant collection.
 *
 * Usage in server components, layouts, and API routes:
 *   const { tenantId, subdomain, tenant } = await getTenantContext();
 */
export async function getTenantContext(): Promise<TenantContext> {
  const headerStore = await headers();
  const slug = headerStore.get("x-tenant-slug") || "";

  if (!slug) {
    return { tenantId: null, subdomain: null, tenant: null };
  }

  try {
    await connectDB();

    const doc = await Tenant.findOne({ subdomain: slug, status: "active" }).lean();

    if (!doc) {
      return { tenantId: null, subdomain: slug, tenant: null };
    }

    const tenant: ITenant = {
      _id:         doc._id,
      name:        doc.name,
      displayName: doc.displayName,
      subdomain:   doc.subdomain,
      status:      doc.status as ITenant["status"],
      address: {
        city:    doc.address?.city,
        state:   doc.address?.state,
        country: doc.address?.country,
      },
      settings: {
        logo: doc.settings?.logo,
      },
      subscription: {
        plan:         doc.subscription?.plan,
        status:       doc.subscription?.status as ITenant["subscription"]["status"],
        billingCycle: doc.subscription?.billingCycle as ITenant["subscription"]["billingCycle"],
        expiresAt:    doc.subscription?.expiresAt,
      },
    } as unknown as ITenant;

    return {
      tenantId: doc._id.toString(),
      subdomain: slug,
      tenant,
    };
  } catch (err) {
    console.error("[getTenantContext] DB error:", err);
    return { tenantId: null, subdomain: slug, tenant: null };
  }
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
 * without hitting the database. Useful for link generation.
 */
export async function getTenantSlug(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get("x-tenant-slug") || null;
}

/**
 * Assert the current slug resolves to an active tenant.
 * Throws if not found. Use in routes that require a valid tenant.
 */
export async function verifyTenant(): Promise<ITenant> {
  const { tenant, subdomain } = await getTenantContext();

  if (!tenant) {
    const msg = subdomain
      ? `No active tenant found for slug "${subdomain}".`
      : "This request requires a tenant context.";
    throw new Error(msg);
  }

  return tenant;
}

/**
 * Extract tenant slug from a raw pathname string.
 * Edge-safe — no DB calls, no server-only imports.
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

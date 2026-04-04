import { Types } from "mongoose";
import { getTenantId } from "./tenant";

// ─────────────────────────────────────────────────────────────────
// Tenant Query Helpers
// Utility functions that encode the tenant filter pattern used
// consistently across all model queries.
// ─────────────────────────────────────────────────────────────────

type MongoQuery = Record<string, unknown>;

/**
 * Build the tenantId filter clause for a standard (singular) tenantId field.
 *
 * - When tenantId is present  → { tenantId: ObjectId }
 * - When tenantId is null      → backward-compat: { $or: [{tenantId: {$exists:false}},{tenantId:null}] }
 */
export function createTenantFilter(tenantId: string | null): MongoQuery {
  if (tenantId) {
    return { tenantId: new Types.ObjectId(tenantId) };
  }
  // Legacy documents that predate multi-tenancy have no tenantId
  return {
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null },
    ],
  };
}

/**
 * Build the tenantId filter for the Patient model (uses array field `tenantIds`).
 *
 * - When tenantId is present  → { tenantIds: ObjectId }  (array membership)
 * - When tenantId is null     → backward-compat null/missing
 */
export function createPatientTenantFilter(tenantId: string | null): MongoQuery {
  if (tenantId) {
    return { tenantIds: new Types.ObjectId(tenantId) };
  }
  return {
    $or: [
      { tenantIds: { $exists: false } },
      { tenantIds: { $size: 0 } },
    ],
  };
}

/**
 * Synchronous helper — merge a base query with a tenant filter.
 * Pass the tenantId you already have (e.g. from session or getTenantContext).
 */
export function createTenantQuery(
  tenantId: string | null,
  baseQuery: MongoQuery = {}
): MongoQuery {
  return { ...baseQuery, ...createTenantFilter(tenantId) };
}

/**
 * Async version — auto-resolves tenantId from the current request host.
 * Merges the result into `baseQuery`.
 * server-only (calls getTenantId which reads headers()).
 */
export async function addTenantFilter(
  baseQuery: MongoQuery = {}
): Promise<MongoQuery> {
  const tenantId = await getTenantId();
  return createTenantQuery(tenantId, baseQuery);
}

/**
 * Add tenantId to a document payload before saving.
 * Async version — resolves from host header.
 */
export async function ensureTenantId(
  data: MongoQuery
): Promise<MongoQuery> {
  const tenantId = await getTenantId();
  if (tenantId && !data.tenantId) {
    return { ...data, tenantId: new Types.ObjectId(tenantId) };
  }
  return data;
}

/**
 * Synchronous version of ensureTenantId — pass tenantId explicitly.
 */
export function ensureTenantIdSync(
  data: MongoQuery,
  tenantId: string | null
): MongoQuery {
  if (tenantId && !data.tenantId) {
    return { ...data, tenantId: new Types.ObjectId(tenantId) };
  }
  return data;
}

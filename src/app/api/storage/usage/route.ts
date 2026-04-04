import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getTenantId } from "@/lib/tenant";
import { getStorageUsage } from "@/lib/storage-tracking";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/storage/usage
// Per-tenant storage breakdown
// ─────────────────────────────────────────────────────────────────

async function handler(_req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    const usage = await getStorageUsage(tenantId);

    return successResponse({
      totalBytes: usage.totalBytes,
      totalMB: (usage.totalBytes / (1024 * 1024)).toFixed(2),
      limitBytes: usage.limitBytes,
      limitGB: (usage.limitBytes / (1024 * 1024 * 1024)).toFixed(2),
      usagePercent: usage.usagePercent.toFixed(1),
      breakdown: usage.breakdown,
    });
  } catch (err) {
    console.error("[GET /api/storage/usage]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);

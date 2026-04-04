import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/subscription/status
// Returns the current subscription plan and expiry for this tenant
// ─────────────────────────────────────────────────────────────────

async function handler(req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    await connectDB();

    const tenant = await Tenant.findById(tenantId, "subscription name subdomain").lean();
    if (!tenant) return errorResponse("Tenant not found", 404);

    const t = tenant as unknown as {
      name: string;
      subdomain: string;
      subscription: {
        plan?: string;
        status: string;
        billingCycle?: string;
        expiresAt?: Date;
        renewalAt?: Date;
      };
    };

    const now = new Date();
    const isExpired =
      t.subscription.expiresAt && new Date(t.subscription.expiresAt) < now;

    return successResponse({
      tenantName: t.name,
      subdomain: t.subdomain,
      plan: t.subscription.plan || "trial",
      status: isExpired ? "expired" : t.subscription.status,
      billingCycle: t.subscription.billingCycle,
      expiresAt: t.subscription.expiresAt,
      renewalAt: t.subscription.renewalAt,
      isActive: !isExpired && t.subscription.status === "active",
      daysRemaining: t.subscription.expiresAt
        ? Math.max(
            0,
            Math.ceil(
              (new Date(t.subscription.expiresAt).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : null,
    });
  } catch (err) {
    console.error("[GET /api/subscription/status]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);

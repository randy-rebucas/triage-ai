import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getTenantId } from "@/lib/tenant";
import { createPayPalOrder, type PlanName, type BillingCycle } from "@/lib/paypal";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/subscription/create-order
// Begin a PayPal payment for a subscription plan upgrade
// ─────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  plan: z.enum(["basic", "pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]),
});

async function handler(req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const { plan, billingCycle } = parsed.data;

    const { orderId, approvalUrl } = await createPayPalOrder(
      plan as PlanName,
      billingCycle as BillingCycle,
      tenantId
    );

    return successResponse({
      orderId,
      approvalUrl,
      plan,
      billingCycle,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create PayPal order";
    console.error("[POST /api/subscription/create-order]", err);
    return serverErrorResponse(msg);
  }
}

export const POST = withAuth(handler);

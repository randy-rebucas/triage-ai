import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import { getTenantId } from "@/lib/tenant";
import { capturePayPalOrder } from "@/lib/paypal";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/subscription/capture-order
// Complete a PayPal order after user approval and activate subscription
// ─────────────────────────────────────────────────────────────────

const captureSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
});

const PLAN_DURATIONS: Record<string, Record<string, number>> = {
  basic:      { monthly: 30, yearly: 365 },
  pro:        { monthly: 30, yearly: 365 },
  enterprise: { monthly: 30, yearly: 365 },
};

async function handler(req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    const body = await req.json();
    const parsed = captureSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    await connectDB();

    const result = await capturePayPalOrder(parsed.data.orderId);
    const { plan, billingCycle } = result.customData;

    // Verify the payment is for this tenant
    if (result.customData.tenantId !== tenantId) {
      return errorResponse("Order does not belong to this tenant", 403);
    }

    const days = PLAN_DURATIONS[plan]?.[billingCycle] || 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const renewalAt = new Date(expiresAt.getTime() - 3 * 24 * 60 * 60 * 1000);

    await Tenant.findByIdAndUpdate(tenantId, {
      "subscription.plan": plan,
      "subscription.status": "active",
      "subscription.billingCycle": billingCycle,
      "subscription.expiresAt": expiresAt,
      "subscription.renewalAt": renewalAt,
      "subscription.paypalOrderId": parsed.data.orderId,
      $push: {
        "subscription.paymentHistory": {
          transactionId: result.transactionId,
          orderId: parsed.data.orderId,
          amount: result.amount,
          currency: result.currency,
          payerEmail: result.payerEmail,
          plan,
          billingCycle,
          status: "completed",
          paidAt: new Date(),
        },
      },
    });

    return successResponse({
      plan,
      billingCycle,
      expiresAt,
      transactionId: result.transactionId,
      amount: result.amount,
    }, "Subscription activated successfully");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Capture failed";
    console.error("[POST /api/subscription/capture-order]", err);
    return serverErrorResponse(msg);
  }
}

export const POST = withAuth(handler);

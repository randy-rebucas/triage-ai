import { NextRequest } from "next/server";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import { verifyPayPalWebhook } from "@/lib/paypal";
import { serverErrorResponse } from "@/lib/api/response";

// ─────────────────────────────────────────────────────────────────
// POST /api/subscription/webhook
// PayPal webhook receiver — no session required.
// Authenticated by PayPal signature + PAYPAL_WEBHOOK_ID.
// Idempotency via Tenant.subscription.processedWebhookIds[].
// CSRF exempt (see middleware.ts CSRF_EXEMPT_PATHS).
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const rawBody = await req.text();

    const isValid = await verifyPayPalWebhook(req.headers, rawBody);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(rawBody) as {
      id: string;
      event_type: string;
      resource: {
        id: string;
        custom_id?: string;
        amount?: { value: string; currency_code: string };
        payer?: { email_address: string };
      };
    };

    await connectDB();

    // ── Idempotency check ─────────────────────────────────────────
    const webhookId = event.id;
    const tenant = await Tenant.findOne({
      "subscription.processedWebhookIds": webhookId,
    });
    if (tenant) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Handle event types ────────────────────────────────────────
    const customData = event.resource.custom_id
      ? JSON.parse(event.resource.custom_id)
      : null;

    if (!customData?.tenantId) {
      // Can't resolve tenant — acknowledge but ignore
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const targetTenant = await Tenant.findById(customData.tenantId);
    if (!targetTenant) {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        // Payment successful — extend subscription
        const days = customData.billingCycle === "yearly" ? 365 : 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await Tenant.findByIdAndUpdate(customData.tenantId, {
          "subscription.status": "active",
          "subscription.expiresAt": expiresAt,
          $push: {
            "subscription.processedWebhookIds": webhookId,
            "subscription.paymentHistory": {
              transactionId: event.resource.id,
              orderId: event.resource.id,
              amount: parseFloat(event.resource.amount?.value || "0"),
              currency: event.resource.amount?.currency_code || "USD",
              payerEmail: event.resource.payer?.email_address || "",
              plan: customData.plan || targetTenant.subscription.plan,
              billingCycle: customData.billingCycle || targetTenant.subscription.billingCycle,
              status: "completed",
              paidAt: new Date(),
            },
          },
        });
        break;
      }

      case "PAYMENT.CAPTURE.DENIED":
      case "BILLING.SUBSCRIPTION.CANCELLED": {
        await Tenant.findByIdAndUpdate(customData.tenantId, {
          "subscription.status": "cancelled",
          $push: { "subscription.processedWebhookIds": webhookId },
        });
        break;
      }

      case "BILLING.SUBSCRIPTION.EXPIRED": {
        await Tenant.findByIdAndUpdate(customData.tenantId, {
          "subscription.status": "expired",
          $push: { "subscription.processedWebhookIds": webhookId },
        });
        break;
      }

      default:
        // Unknown event — record webhook ID and move on
        await Tenant.findByIdAndUpdate(customData.tenantId, {
          $push: { "subscription.processedWebhookIds": webhookId },
        });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[POST /api/subscription/webhook]", err);
    return serverErrorResponse();
  }
}

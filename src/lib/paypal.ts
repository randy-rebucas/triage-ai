// ─────────────────────────────────────────────────────────────────
// PayPal API Client
// Wraps PayPal Orders API v2 for subscription billing
// ─────────────────────────────────────────────────────────────────

const PAYPAL_BASE =
  process.env.NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// Plan pricing configuration
export const PLAN_PRICES: Record<string, Record<string, number>> = {
  basic: { monthly: 19.99, yearly: 199.99 },
  pro: { monthly: 49.99, yearly: 499.99 },
  enterprise: { monthly: 99.99, yearly: 999.99 },
};

export type PlanName = "basic" | "pro" | "enterprise";
export type BillingCycle = "monthly" | "yearly";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function createPayPalOrder(
  plan: PlanName,
  billingCycle: BillingCycle,
  tenantId: string
): Promise<{ orderId: string; approvalUrl: string }> {
  const token = await getAccessToken();
  const amount = PLAN_PRICES[plan]?.[billingCycle];

  if (!amount) throw new Error(`Invalid plan or billing cycle: ${plan}/${billingCycle}`);

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `${tenantId}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: tenantId,
          description: `ClinicAI ${plan} plan (${billingCycle})`,
          amount: {
            currency_code: "USD",
            value: amount.toFixed(2),
          },
          custom_id: JSON.stringify({ tenantId, plan, billingCycle }),
        },
      ],
      application_context: {
        brand_name: "ClinicAI",
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription/success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription/cancel`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`PayPal order creation failed: ${JSON.stringify(err)}`);
  }

  const order = await res.json() as {
    id: string;
    links: { rel: string; href: string }[];
  };

  const approvalUrl =
    order.links.find((l) => l.rel === "approve")?.href || "";

  return { orderId: order.id, approvalUrl };
}

export async function capturePayPalOrder(orderId: string): Promise<{
  transactionId: string;
  payerEmail: string;
  amount: number;
  currency: string;
  customData: { tenantId: string; plan: string; billingCycle: string };
}> {
  const token = await getAccessToken();

  const res = await fetch(
    `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`PayPal capture failed: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as {
    purchase_units: {
      payments: {
        captures: {
          id: string;
          amount: { value: string; currency_code: string };
          custom_id: string;
        }[];
      };
    }[];
    payer: { email_address: string };
  };

  const capture = data.purchase_units[0]?.payments?.captures?.[0];
  const customData = JSON.parse(capture?.custom_id || "{}");

  return {
    transactionId: capture.id,
    payerEmail: data.payer.email_address,
    amount: parseFloat(capture.amount.value),
    currency: capture.amount.currency_code,
    customData,
  };
}

/**
 * Verify a PayPal webhook signature.
 * Returns true if the event is legitimate.
 */
export async function verifyPayPalWebhook(
  headers: Headers,
  rawBody: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  const token = await getAccessToken();

  const res = await fetch(
    `${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    }
  );

  if (!res.ok) return false;

  const { verification_status } = await res.json() as { verification_status: string };
  return verification_status === "SUCCESS";
}

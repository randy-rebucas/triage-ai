import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import Patient from "@/models/Patient";
import TriageSession from "@/models/TriageSession";
import ClinicalRecord from "@/models/ClinicalRecord";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { Types } from "mongoose";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/subscription/dashboard
// Full usage + billing summary for the calling tenant
// ─────────────────────────────────────────────────────────────────

async function handler(_req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    await connectDB();

    const tid = new Types.ObjectId(tenantId);

    const [tenant, patientCount, sessionCount, recordCount] = await Promise.all([
      Tenant.findById(tenantId, "subscription name subdomain").lean(),
      Patient.countDocuments({ tenantIds: tid }),
      TriageSession.countDocuments({ tenantId: tid }),
      ClinicalRecord.countDocuments({ tenantId: tid }),
    ]);

    if (!tenant) return errorResponse("Tenant not found", 404);

    const t = tenant as unknown as {
      name: string;
      subdomain: string;
      subscription: {
        plan?: string;
        status: string;
        billingCycle?: string;
        expiresAt?: Date;
        paymentHistory?: { paidAt: Date; amount: number }[];
      };
    };

    const now = new Date();
    const isExpired =
      t.subscription.expiresAt && new Date(t.subscription.expiresAt) < now;

    const totalRevenue = (t.subscription.paymentHistory || []).reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    return successResponse({
      tenant: { name: t.name, subdomain: t.subdomain },
      subscription: {
        plan: t.subscription.plan || "trial",
        status: isExpired ? "expired" : t.subscription.status,
        billingCycle: t.subscription.billingCycle,
        expiresAt: t.subscription.expiresAt,
        isActive: !isExpired && t.subscription.status === "active",
      },
      usage: {
        patients: patientCount,
        triageSessions: sessionCount,
        clinicalRecords: recordCount,
      },
      billing: {
        totalRevenue,
        paymentCount: (t.subscription.paymentHistory || []).length,
        lastPayment: (t.subscription.paymentHistory || []).at(-1) || null,
      },
    });
  } catch (err) {
    console.error("[GET /api/subscription/dashboard]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);

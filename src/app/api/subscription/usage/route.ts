import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import connectDB from "@/lib/db/mongodb";
import Patient from "@/models/Patient";
import TriageSession from "@/models/TriageSession";
import ClinicalRecord from "@/models/ClinicalRecord";
import User from "@/models/User";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { Types } from "mongoose";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/subscription/usage
// Resource usage counters for the calling tenant
// ─────────────────────────────────────────────────────────────────

async function handler(_req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    await connectDB();

    const tid = new Types.ObjectId(tenantId);

    const [
      patientCount,
      triageCount,
      completedTriageCount,
      recordCount,
      staffCount,
    ] = await Promise.all([
      Patient.countDocuments({ tenantIds: tid }),
      TriageSession.countDocuments({ tenantId: tid }),
      TriageSession.countDocuments({ tenantId: tid, status: "completed" }),
      ClinicalRecord.countDocuments({ tenantId: tid }),
      User.countDocuments({ tenantId: tid, isActive: true }),
    ]);

    return successResponse({
      patients: patientCount,
      triageSessions: {
        total: triageCount,
        completed: completedTriageCount,
        pending: triageCount - completedTriageCount,
      },
      clinicalRecords: recordCount,
      activeStaff: staffCount,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/subscription/usage]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);

import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getPatientById } from "@/services/patientService";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/patients/[patientId]
// Doctors can view any patient; patients view their own profile
// ─────────────────────────────────────────────────────────────────

async function handler(
  req: NextRequest,
  user: IAuthPayload,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;
    const patientId = params?.patientId;

    if (!patientId) return errorResponse("Patient ID is required", 400);

    const tenantId = user.tenantId || (await getTenantId());
    const patient = await getPatientById(patientId, tenantId);
    if (!patient) return errorResponse("Patient not found", 404, "NOT_FOUND");

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "view",
      resource: "Patient",
      resourceId: patientId,
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(patient);
  } catch (err) {
    console.error("[/api/patients/[patientId]]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler, ["doctor", "admin"]);

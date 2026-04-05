import { NextRequest } from "next/server";
import { withPatientAuth, type PatientRouteContext } from "@/lib/api/withPatientAuth";
import { getTriageSession } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IPatientJwtPayload } from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// GET /api/triage/[sessionId]
//
// Returns the patient's own triage session in a sanitised view.
// Possible conditions and raw AI internals are never exposed.
// ─────────────────────────────────────────────────────────────────

async function handler(
  req: NextRequest,
  patient: IPatientJwtPayload,
  context: PatientRouteContext
): Promise<Response> {
  try {
    const params    = await context.params;
    const sessionId = params?.sessionId;

    if (!sessionId) return errorResponse("Session ID is required", 400);

    const tenantId = await getTenantId();
    const session  = await getTriageSession(sessionId, patient.patientId, "patient", tenantId);

    // Patients see recommendations + safety info only — no raw AI conditions
    return successResponse({
      _id:             session._id,
      chiefComplaint:  session.chiefComplaint,
      status:          session.status,
      riskLevel:       session.riskLevel,
      recommendations: session.recommendations,
      safetyFlags:     session.safetyFlags,
      doctorValidation: session.doctorValidation
        ? {
            doctorName:  session.doctorValidation.doctorName,
            validatedAt: session.doctorValidation.validatedAt,
            notes:       session.doctorValidation.notes,
          }
        : undefined,
      disclaimer:
        "This is an AI-assisted pre-consultation assessment. It is NOT a medical diagnosis. Please consult a healthcare professional for proper evaluation.",
      createdAt: session.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve session";
    if (message.includes("not found"))    return errorResponse(message, 404);
    if (message.includes("Access denied")) return errorResponse(message, 403);
    console.error("[GET /api/triage/[sessionId]]", err);
    return serverErrorResponse();
  }
}

export const GET = withPatientAuth(handler);

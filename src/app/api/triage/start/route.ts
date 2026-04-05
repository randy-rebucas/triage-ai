import { NextRequest } from "next/server";
import { withPatientAuth, type PatientRouteContext } from "@/lib/api/withPatientAuth";
import { startTriageSession } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import { triageStartSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IPatientJwtPayload } from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/start
// Starts a new AI triage session for the authenticated patient.
// ─────────────────────────────────────────────────────────────────

async function handler(
  req: NextRequest,
  patient: IPatientJwtPayload,
  _context: PatientRouteContext
): Promise<Response> {
  try {
    const body   = await req.json();
    const parsed = triageStartSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = await getTenantId();
    const result   = await startTriageSession(patient.patientId, parsed.data, tenantId);

    return successResponse(
      {
        sessionId:      result.session._id,
        firstQuestion:  result.firstQuestion,
        questionId:     result.questionId,
        chiefComplaint: result.session.chiefComplaint,
        safetyFlags:    result.session.safetyFlags,
      },
      "Triage session started",
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start triage";
    if (message.includes("Patient profile not found")) {
      return errorResponse(message, 404, "PROFILE_INCOMPLETE");
    }
    console.error("[POST /api/triage/start]", err);
    return serverErrorResponse(message);
  }
}

export const POST = withPatientAuth(handler);

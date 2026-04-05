import { NextRequest } from "next/server";
import { withPatientAuth, type PatientRouteContext } from "@/lib/api/withPatientAuth";
import { submitAnswer } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import { triageAnswerSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IPatientJwtPayload } from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/[sessionId]/answer
// Submit an answer to the current triage question.
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

    const body   = await req.json();
    const parsed = triageAnswerSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = await getTenantId();
    const result   = await submitAnswer(sessionId, patient.patientId, parsed.data, tenantId);

    if (result.isComplete) {
      return successResponse(
        {
          isComplete: true,
          progress:   100,
          session:    result.session,
          message:    "Your symptom assessment is complete. A clinician will review your report shortly.",
        },
        "Triage assessment complete"
      );
    }

    return successResponse({
      isComplete:     false,
      nextQuestion:   result.nextQuestion,
      nextQuestionId: result.nextQuestionId,
      progress:       result.progress,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit answer";

    if (message.includes("not found") || message.includes("Access denied")) {
      return errorResponse(message, message.includes("Access denied") ? 403 : 404);
    }
    if (message.includes("already completed")) {
      return errorResponse(message, 409, "SESSION_COMPLETED");
    }

    console.error("[POST /api/triage/[sessionId]/answer]", err);
    return serverErrorResponse(message);
  }
}

export const POST = withPatientAuth(handler);

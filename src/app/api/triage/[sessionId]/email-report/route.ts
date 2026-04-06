import { NextRequest } from "next/server";
import { z } from "zod";
import { withPatientAuth, type PatientRouteContext } from "@/lib/api/withPatientAuth";
import { getTenantId } from "@/lib/tenant";
import { getTriageSession } from "@/services/triageService";
import { sendReportEmail } from "@/lib/email";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import type { IPatientJwtPayload } from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/[sessionId]/email-report
//
// Sends the patient's completed triage report to a given email
// address. The session must belong to the authenticated patient.
// ─────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

async function handler(
  req:     NextRequest,
  patient: IPatientJwtPayload,
  context: PatientRouteContext,
): Promise<Response> {
  const params    = await context.params;
  const sessionId = params?.sessionId;
  if (!sessionId) {
    return errorResponse("Session ID is required", 400, "BAD_REQUEST");
  }

  const body   = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const tenantId = await getTenantId();

  let session;
  try {
    session = await getTriageSession(sessionId, patient.patientId, "patient", tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Session not found";
    return errorResponse(msg, 404, "NOT_FOUND");
  }

  if (session.status === "in-progress") {
    return errorResponse(
      "The assessment is not yet complete. Please finish all questions first.",
      400,
      "SESSION_INCOMPLETE"
    );
  }

  try {
    await sendReportEmail({ to: parsed.data.email, session });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    console.error("[POST /api/triage/email-report]", err);

    // Distinguish between config errors (503) and send errors (500)
    const isConfigError = msg.includes("not configured");
    return errorResponse(
      isConfigError
        ? "Email delivery is not available right now. Please try downloading your report instead."
        : "Failed to send the email. Please try again.",
      isConfigError ? 503 : 500,
      isConfigError ? "EMAIL_NOT_CONFIGURED" : "EMAIL_SEND_FAILED"
    );
  }

  return successResponse(
    { email: parsed.data.email },
    `Report sent to ${parsed.data.email}`
  );
}

export const POST = withPatientAuth(handler);

import { NextRequest } from "next/server";
import { z } from "zod";
import { withPatientAuth, type PatientRouteContext } from "@/lib/api/withPatientAuth";
import { getTenantId, getTenantSlug } from "@/lib/tenant";
import { getTriageSession } from "@/services/triageService";
import { sendReportEmail } from "@/lib/email";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import { rateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import type { IPatientJwtPayload } from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/[sessionId]/email-report
//
// Sends the patient's completed triage report to a given email
// address. The session must belong to the authenticated patient.
//
// Rate limit: 3 emails per session per patient per 10 minutes.
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

  // Rate-limit: 3 emails per session per patient per 10 minutes
  const rl = rateLimit(`triage:email:${patient.patientId}:${sessionId}`, 3, 10 * 60 * 1000);
  if (!rl.allowed) {
    const headers = new Headers({ "Content-Type": "application/json" });
    applyRateLimitHeaders(headers, rl);
    headers.set("Retry-After", String(rl.retryAfter ?? 600));
    return new Response(
      JSON.stringify({ error: "Too many email requests. Please wait a few minutes before trying again." }),
      { status: 429, headers }
    );
  }

  const body   = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const tenantId   = await getTenantId();
  const tenantSlug = await getTenantSlug();

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
    await sendReportEmail({
      to:         parsed.data.email,
      session,
      tenantSlug: tenantSlug ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    console.error("[POST /api/triage/email-report]", err);

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

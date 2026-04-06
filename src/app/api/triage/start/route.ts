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
import { rateLimit, getClientIp, applyRateLimitHeaders } from "@/lib/api/rate-limit";
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
  // Rate-limit: 5 new sessions per patient per 10 minutes
  const rl = rateLimit(`triage:start:${patient.patientId}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    const headers = new Headers({ "Content-Type": "application/json" });
    applyRateLimitHeaders(headers, rl);
    headers.set("Retry-After", String(rl.retryAfter ?? 60));
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before starting another assessment." }),
      { status: 429, headers }
    );
  }

  try {
    const body   = await req.json();
    const parsed = triageStartSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      // Log slug so we can see what was received vs what the DB has
      const { getTenantSlug } = await import("@/lib/tenant");
      const slug = await getTenantSlug();
      console.error(
        `[POST /api/triage/start] tenantId resolved to null — slug received: "${slug ?? "(none)"}". ` +
        "Check that the Tenant document exists in MongoDB with status='active'."
      );
      return errorResponse(
        "Clinic configuration not found. Please refresh the page and try again.",
        503,
        "TENANT_NOT_FOUND"
      );
    }

    const result = await startTriageSession(patient.patientId, parsed.data, tenantId);

    return successResponse(
      {
        sessionId:      result.session._id,
        firstQuestion:  result.firstQuestion,
        questionId:     result.questionId,
        inputType:      result.inputType,
        isEmergency:    result.isEmergency,
        chiefComplaint: result.session.chiefComplaint,
        safetyFlags:    result.session.safetyFlags,
      },
      result.isEmergency ? "Emergency fast-path triggered" : "Triage session started",
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start triage";
    if (message.includes("Patient profile not found")) {
      return errorResponse(message, 404, "PROFILE_INCOMPLETE");
    }
    console.error("[POST /api/triage/start]", err);
    return serverErrorResponse();
  }
}

export const POST = withPatientAuth(handler);

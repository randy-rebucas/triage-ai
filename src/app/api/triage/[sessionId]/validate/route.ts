import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { validateTriageSession } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import { getUserById } from "@/services/authService";
import { doctorValidationSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/[sessionId]/validate
// Doctors only — validate and add diagnosis to a triage session
// ─────────────────────────────────────────────────────────────────

async function handler(
  req: NextRequest,
  user: IAuthPayload,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;
    const sessionId = params?.sessionId;

    if (!sessionId) {
      return errorResponse("Session ID is required", 400);
    }

    const body = await req.json();
    const parsed = doctorValidationSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    // Fetch doctor's name for the validation record
    const doctor = await getUserById(user.userId);
    const doctorName = doctor?.name || "Unknown Doctor";

    const tenantId = user.tenantId || (await getTenantId());
    const session = await validateTriageSession(
      sessionId,
      user.userId,
      doctorName,
      parsed.data,
      tenantId
    );

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "validate",
      resource: "TriageSession",
      resourceId: sessionId,
      details: {
        finalDiagnosis: parsed.data.finalDiagnosis,
        icd10Code: parsed.data.icd10Code,
        agreedWithAI: parsed.data.agreedWithAI,
      },
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(session, "Triage session validated successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";

    if (message.includes("not found")) return errorResponse(message, 404);
    if (message.includes("Only completed")) return errorResponse(message, 409);

    console.error("[/api/triage/[sessionId]/validate]", err);
    return serverErrorResponse();
  }
}

export const POST = withAuth(handler, ["doctor", "admin"]);

import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { startTriageSession } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import { triageStartSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/start
// Patients only — starts a new AI triage session
// ─────────────────────────────────────────────────────────────────

async function handler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const body = await req.json();

    const parsed = triageStartSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = user.tenantId || (await getTenantId());
    const result = await startTriageSession(user.userId, parsed.data, tenantId);

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "create",
      resource: "TriageSession",
      resourceId: result.session._id,
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(
      {
        sessionId: result.session._id,
        firstQuestion: result.firstQuestion,
        questionId: result.questionId,
        chiefComplaint: result.session.chiefComplaint,
        safetyFlags: result.session.safetyFlags,
      },
      "Triage session started",
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start triage";

    if (message.includes("Patient profile not found")) {
      return errorResponse(message, 404, "PROFILE_INCOMPLETE");
    }

    console.error("[/api/triage/start]", err);
    return serverErrorResponse(message);
  }
}

export const POST = withAuth(handler, ["patient"]);

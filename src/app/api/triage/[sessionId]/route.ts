import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getTriageSession } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/triage/[sessionId]
// Retrieve a triage session. Patients see own sessions only.
// Doctors see all completed/validated sessions.
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

    const tenantId = user.tenantId || (await getTenantId());
    const session = await getTriageSession(sessionId, user.userId, user.role, tenantId);

    // Patients get a sanitised view — no raw AI internals
    const responseData =
      user.role === "patient"
        ? {
            _id: session._id,
            chiefComplaint: session.chiefComplaint,
            status: session.status,
            riskLevel: session.riskLevel,
            recommendations: session.recommendations,
            safetyFlags: session.safetyFlags,
            // CRITICAL: Patients NEVER see possibleConditions by medical name
            // They only see recommendations and safety info
            disclaimer:
              "This is an AI-assisted pre-consultation assessment. It is NOT a medical diagnosis. Please consult your doctor for proper evaluation.",
            createdAt: session.createdAt,
          }
        : session; // Doctors get full data

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "view",
      resource: "TriageSession",
      resourceId: sessionId,
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(responseData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve session";

    if (message.includes("not found")) return errorResponse(message, 404);
    if (message.includes("Access denied")) return errorResponse(message, 403);

    console.error("[/api/triage/[sessionId]]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);

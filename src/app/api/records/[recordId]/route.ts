import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import {
  getClinicalRecord,
  updateClinicalRecord,
} from "@/services/recordService";
import { getTenantId } from "@/lib/tenant";
import { clinicalRecordSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET   /api/records/[recordId]
// PATCH /api/records/[recordId]
// ─────────────────────────────────────────────────────────────────

async function getHandler(
  req: NextRequest,
  user: IAuthPayload,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;
    const recordId = params?.recordId;
    if (!recordId) return errorResponse("Record ID is required", 400);

    const tenantId = user.tenantId || (await getTenantId());
    const record = await getClinicalRecord(recordId, user.userId, user.role, tenantId);

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "view",
      resource: "ClinicalRecord",
      resourceId: recordId,
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    if (message.includes("not found")) return errorResponse(message, 404);
    if (message.includes("Access denied")) return errorResponse(message, 403);
    console.error("[GET /api/records/[recordId]]", err);
    return serverErrorResponse();
  }
}

async function patchHandler(
  req: NextRequest,
  user: IAuthPayload,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;
    const recordId = params?.recordId;
    if (!recordId) return errorResponse("Record ID is required", 400);

    const body = await req.json();
    const parsed = clinicalRecordSchema.partial().safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = user.tenantId || (await getTenantId());
    const record = await updateClinicalRecord(recordId, user.userId, parsed.data, tenantId);

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "update",
      resource: "ClinicalRecord",
      resourceId: recordId,
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(record, "Record updated successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    if (message.includes("not found")) return errorResponse(message, 404);
    if (message.includes("own")) return errorResponse(message, 403);
    if (message.includes("Finalized")) return errorResponse(message, 409);
    console.error("[PATCH /api/records/[recordId]]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler, ["doctor", "admin"]);

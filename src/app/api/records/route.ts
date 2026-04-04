import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { createClinicalRecord, getDoctorRecords } from "@/services/recordService";
import { getTenantId } from "@/lib/tenant";
import { clinicalRecordSchema, paginationSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/records  — Doctor creates a clinical record
// GET  /api/records  — Doctor gets their own records
// ─────────────────────────────────────────────────────────────────

async function postHandler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = clinicalRecordSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = user.tenantId || (await getTenantId());
    const record = await createClinicalRecord(user.userId, parsed.data, tenantId);

    logAudit({
      userId: user.userId,
      userRole: user.role,
      action: "create",
      resource: "ClinicalRecord",
      resourceId: record._id,
      ipAddress: getClientIP(req.headers),
    });

    return successResponse(record, "Clinical record created", 201);
  } catch (err) {
    console.error("[POST /api/records]", err);
    return serverErrorResponse();
  }
}

async function getHandler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = paginationSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );
    const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 10 };

    const tenantId = user.tenantId || (await getTenantId());
    const result = await getDoctorRecords(user.userId, tenantId, page, limit);

    return successResponse({
      ...result,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (err) {
    console.error("[GET /api/records]", err);
    return serverErrorResponse();
  }
}

export const POST = withAuth(postHandler, ["doctor", "admin"]);
export const GET = withAuth(getHandler, ["doctor", "admin"]);

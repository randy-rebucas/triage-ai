import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getAllPatients } from "@/services/patientService";
import { getTenantId } from "@/lib/tenant";
import { paginationSchema } from "@/lib/validations/schemas";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/patients
// Doctors only — list all patients with optional search
// ─────────────────────────────────────────────────────────────────

async function handler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = paginationSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    const { page, limit, search } = parsed.success
      ? parsed.data
      : { page: 1, limit: 10, search: undefined };

    const tenantId = user.tenantId || (await getTenantId());
    const result = await getAllPatients(tenantId, page, limit, search);

    return successResponse({
      ...result,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (err) {
    console.error("[/api/patients]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler, ["doctor", "admin"]);

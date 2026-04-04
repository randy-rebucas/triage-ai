import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getPendingReviews } from "@/services/triageService";
import { getTenantId } from "@/lib/tenant";
import { paginationSchema } from "@/lib/validations/schemas";
import { successResponse, serverErrorResponse } from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/triage/pending
// Doctors only — list sessions awaiting doctor review
// ─────────────────────────────────────────────────────────────────

async function handler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = paginationSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 10 };
    const riskLevel = searchParams.get("riskLevel") || undefined;

    const tenantId = user.tenantId || (await getTenantId());
    const result = await getPendingReviews(tenantId, page, limit, riskLevel);

    return successResponse({
      ...result,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (err) {
    console.error("[/api/triage/pending]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler, ["doctor", "admin"]);

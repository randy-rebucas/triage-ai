import { NextRequest } from "next/server";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { paginationSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET  /api/tenants — list all tenants (admin only)
// POST /api/tenants — create tenant via API (admin only)
// ─────────────────────────────────────────────────────────────────

async function getHandler(req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const parsed = paginationSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );
    const { page, limit, search } = parsed.success
      ? parsed.data
      : { page: 1, limit: 10, search: undefined };

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { subdomain: { $regex: search, $options: "i" } },
      ];
    }

    const statusFilter = searchParams.get("status");
    if (statusFilter) filter.status = statusFilter;

    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
      Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Tenant.countDocuments(filter),
    ]);

    return successResponse({
      tenants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[GET /api/tenants]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getHandler, ["admin"]);
export const POST = withAuth(
  async (_req, _user, _ctx) => successResponse(null, "Use /api/tenants/onboard"),
  ["admin"]
);

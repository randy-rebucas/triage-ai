import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import connectDB from "@/lib/db/mongodb";
import TriageSession from "@/models/TriageSession";
import { getTenantId } from "@/lib/tenant";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { Types } from "mongoose";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/cleanup
// Remove orphaned/stale data to free storage:
//   - Triage sessions stuck in "in-progress" > 7 days
// ─────────────────────────────────────────────────────────────────

async function handler(_req: NextRequest, user: IAuthPayload, _ctx: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    if (!tenantId) return errorResponse("Tenant context required", 400);

    await connectDB();

    const tid = new Types.ObjectId(tenantId);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Remove abandoned triage sessions
    const staleSessionResult = await TriageSession.deleteMany({
      tenantId: tid,
      status: "in-progress",
      createdAt: { $lt: cutoff },
    });

    return successResponse(
      {
        staleSessionsRemoved: staleSessionResult.deletedCount,
        cleanedAt: new Date().toISOString(),
      },
      `Cleanup complete. Removed ${staleSessionResult.deletedCount} stale sessions.`
    );
  } catch (err) {
    console.error("[POST /api/storage/cleanup]", err);
    return serverErrorResponse();
  }
}

export const POST = withAuth(handler, ["admin", "doctor"]);

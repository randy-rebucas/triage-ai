import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getUserById } from "@/services/authService";
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET /api/auth/me — Returns the currently authenticated user
// ─────────────────────────────────────────────────────────────────

async function handler(_req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const fullUser = await getUserById(user.userId);
    if (!fullUser) return notFoundResponse("User");
    return successResponse(fullUser);
  } catch (err) {
    console.error("[/api/auth/me]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);

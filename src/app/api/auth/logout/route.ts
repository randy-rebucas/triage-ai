import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { successResponse } from "@/lib/api/response";
import { buildClearSessionCookie } from "@/lib/auth/jwt";
import { logAudit, getClientIP } from "@/services/auditService";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────

async function handler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  logAudit({
    userId: user.userId,
    userRole: user.role,
    action: "logout",
    resource: "User",
    resourceId: user.userId,
    ipAddress: getClientIP(req.headers),
  });

  const response = successResponse(null, "Logged out successfully");
  response.headers.set("Set-Cookie", buildClearSessionCookie());

  return response;
}

export const POST = withAuth(handler);

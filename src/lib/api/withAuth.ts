import { NextRequest } from "next/server";
import {
  verifyToken,
  extractBearerToken,
  extractTokenFromCookie,
} from "@/lib/auth/jwt";

import type { IAuthPayload, UserRole } from "@/types";
import { unauthorizedResponse, forbiddenResponse } from "./response";

// ─────────────────────────────────────────────────────────────────
// Route Auth Wrapper (Node.js runtime — API routes only)
// Verifies JWT from cookie or Authorization header.
// ─────────────────────────────────────────────────────────────────

// Next.js 15 App Router route context shape
export type RouteContext = {
  params: Promise<Record<string, string>>;
};

export type AuthenticatedHandler = (
  req: NextRequest,
  user: IAuthPayload,
  context: RouteContext
) => Promise<Response>;

export function withAuth(
  handler: AuthenticatedHandler,
  allowedRoles?: UserRole[]
) {
  return async (
    req: NextRequest,
    context: RouteContext
  ): Promise<Response> => {
    const cookieToken = extractTokenFromCookie(req.headers.get("cookie"));
    const bearerToken = extractBearerToken(req.headers.get("authorization"));
    const token = cookieToken || bearerToken;

    if (!token) {
      return unauthorizedResponse("No authentication token provided");
    }

    let user: IAuthPayload;
    try {
      user = verifyToken(token);
    } catch (err) {
      const message =
        err instanceof Error && err.message === "TOKEN_EXPIRED"
          ? "Your session has expired. Please log in again."
          : "Invalid authentication token.";
      return unauthorizedResponse(message);
    }

    // Role-based access control
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return forbiddenResponse(
        `Access restricted to: ${allowedRoles.join(", ")}`
      );
    }

    return handler(req, user, context);
  };
}

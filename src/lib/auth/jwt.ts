import jwt from "jsonwebtoken";
import type { IAuthPayload, UserRole } from "@/types";

// ─────────────────────────────────────────────────────────────────
// JWT Utilities (Node.js runtime — API routes only)
// For Edge middleware use jwtEdge.ts (jose-based)
// ─────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET (or SESSION_SECRET) is not defined in environment variables."
  );
}

export function signToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: "cms-triage-ai",
    audience: "cms-triage-ai-client",
  });
}

export function verifyToken(token: string): IAuthPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!, {
      issuer: "cms-triage-ai",
      audience: "cms-triage-ai-client",
    }) as IAuthPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new Error("TOKEN_EXPIRED");
    if (err instanceof jwt.JsonWebTokenError) throw new Error("TOKEN_INVALID");
    throw new Error("TOKEN_VERIFICATION_FAILED");
  }
}

export function extractBearerToken(
  authHeader: string | null | undefined
): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

export function extractTokenFromCookie(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      if (key && value) acc[key.trim()] = decodeURIComponent(value.trim());
      return acc;
    },
    {} as Record<string, string>
  );
  // Support both old cookie name and new "session" cookie name
  return cookies["session"] || cookies["auth_token"] || null;
}

/**
 * Build Set-Cookie header value for the session cookie.
 * Supports cross-subdomain sharing via COOKIE_DOMAIN env var.
 */
export function buildSessionCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  const secure = process.env.COOKIE_SECURE === "true";
  const domain = process.env.COOKIE_DOMAIN;

  const parts = [
    `session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (secure) parts.push("Secure");

  // Cross-subdomain: domain=".myclinicsoft.com" allows all subdomains
  if (domain && domain !== "localhost") {
    parts.push(`Domain=${domain}`);
  }

  return parts.join("; ");
}

/**
 * Build a cookie header that clears the session cookie.
 */
export function buildClearSessionCookie(): string {
  const domain = process.env.COOKIE_DOMAIN;
  const parts = [
    "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (domain && domain !== "localhost") parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

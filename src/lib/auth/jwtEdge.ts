import { jwtVerify } from "jose";
import type { IAuthPayload, UserRole } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Edge-compatible JWT utilities (jose — Edge Runtime safe)
// Used ONLY in Next.js middleware. API routes use jwt.ts.
// ─────────────────────────────────────────────────────────────────

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("JWT_SECRET / SESSION_SECRET is not defined.");
  return new TextEncoder().encode(secret);
}

export async function verifyTokenEdge(token: string): Promise<IAuthPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    issuer: "cms-triage-ai",
    audience: "cms-triage-ai-client",
  });
  return {
    userId: payload.userId as string,
    email: payload.email as string,
    role: payload.role as UserRole,
    tenantId: payload.tenantId as string | undefined,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Extract the session token from a Cookie header string.
 * Supports both "session" and legacy "auth_token" cookie names.
 */
export function extractCookieToken(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const cookieMap = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .reduce(
      (acc, c) => {
        const idx = c.indexOf("=");
        if (idx > 0) {
          const k = c.slice(0, idx).trim();
          const v = c.slice(idx + 1).trim();
          acc[k] = decodeURIComponent(v);
        }
        return acc;
      },
      {} as Record<string, string>
    );
  return cookieMap["session"] || cookieMap["auth_token"] || null;
}

/**
 * Extract the patient_session token from a Cookie header string.
 * Patient JWTs carry { patientId, patientCode, type:"patient", email }.
 */
export function extractPatientCookieToken(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const cookieMap = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .reduce(
      (acc, c) => {
        const idx = c.indexOf("=");
        if (idx > 0) {
          const k = c.slice(0, idx).trim();
          const v = c.slice(idx + 1).trim();
          acc[k] = decodeURIComponent(v);
        }
        return acc;
      },
      {} as Record<string, string>
    );
  return cookieMap["patient_session"] || null;
}

/**
 * Verify a patient_session JWT.
 * Payload: { patientId, patientCode, type:"patient", email }
 */
export async function verifyPatientTokenEdge(
  token: string
): Promise<{ patientId: string; patientCode: string; email: string }> {
  const secret = getSecretKey();
  // Patient tokens are not signed with issuer/audience claims
  const { payload } = await jwtVerify(token, secret);
  if (payload["type"] !== "patient") throw new Error("Not a patient token");
  return {
    patientId:   payload["patientId"] as string,
    patientCode: payload["patientCode"] as string,
    email:       payload["email"] as string,
  };
}

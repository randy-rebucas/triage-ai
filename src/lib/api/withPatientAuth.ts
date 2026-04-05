import { NextRequest, NextResponse } from "next/server";
import {
  verifyPatientToken,
  extractPatientCookieToken,
  extractBearerToken,
  type IPatientJwtPayload,
} from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// withPatientAuth — route wrapper for patient-protected endpoints.
//
// Accepts auth via either:
//   • patient_session cookie   (browser portal)
//   • Authorization: Bearer    (third-party / mobile apps)
//
// Injects the verified IPatientJwtPayload as the second argument.
// ─────────────────────────────────────────────────────────────────

export type PatientRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AuthenticatedPatientHandler = (
  req: NextRequest,
  patient: IPatientJwtPayload,
  context: PatientRouteContext
) => Promise<Response>;

function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

export function withPatientAuth(handler: AuthenticatedPatientHandler) {
  return async (
    req: NextRequest,
    context: PatientRouteContext
  ): Promise<Response> => {
    const cookieToken  = extractPatientCookieToken(req.headers.get("cookie"));
    const bearerToken  = extractBearerToken(req.headers.get("authorization"));
    const token        = cookieToken || bearerToken;

    if (!token) return unauthorized("Authentication required");

    let patient: IPatientJwtPayload;
    try {
      patient = verifyPatientToken(token);
    } catch {
      return unauthorized("Invalid or expired session. Please sign in again.");
    }

    return handler(req, patient, context);
  };
}

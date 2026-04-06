import jwt from "jsonwebtoken";

// ─────────────────────────────────────────────────────────────────
// Patient JWT utilities (Node.js runtime — patient API routes)
//
// Issues tokens using SESSION_SECRET.
// Cookie name: patient_session (7 days)
// Bearer token: returned in JSON body (30 days)
//
// Payload shape:
//   { patientId, patientCode, type: "patient", email, iat, exp }
// ─────────────────────────────────────────────────────────────────

const SECRET      = process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
const COOKIE_TTL  = 7  * 24 * 60 * 60;  // 7 days  (seconds)
const BEARER_TTL  = 30 * 24 * 60 * 60;  // 30 days (seconds)

if (!SECRET) {
  throw new Error(
    "[patientJwt] SESSION_SECRET (or JWT_SECRET) is not defined. " +
    "Set SESSION_SECRET in your environment variables."
  );
}

export interface IPatientJwtPayload {
  patientId:   string;
  patientCode: string;
  type:        "patient";
  email:       string;
  iat?:        number;
  exp?:        number;
}

interface SignOptions {
  bearer?: boolean; // false → cookie (7d), true → bearer (30d)
}

export function signPatientToken(
  payload: Omit<IPatientJwtPayload, "type" | "iat" | "exp">,
  { bearer = false }: SignOptions = {}
): string {
  return jwt.sign(
    { ...payload, type: "patient" },
    SECRET,
    { expiresIn: bearer ? BEARER_TTL : COOKIE_TTL }
  );
}

export function verifyPatientToken(token: string): IPatientJwtPayload {
  const decoded = jwt.verify(token, SECRET) as IPatientJwtPayload;
  if (decoded.type !== "patient") throw new Error("TOKEN_INVALID");
  return decoded;
}

// ── Cookie helpers ────────────────────────────────────────────────

export function buildPatientSessionCookie(token: string): string {
  const secure = process.env.COOKIE_SECURE === "true";
  const domain = process.env.COOKIE_DOMAIN;

  const parts = [
    `patient_session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${COOKIE_TTL}`,
  ];

  if (secure) parts.push("Secure");
  if (domain && domain !== "localhost") parts.push(`Domain=${domain}`);

  return parts.join("; ");
}

export function buildClearPatientSessionCookie(): string {
  const domain = process.env.COOKIE_DOMAIN;
  const parts = [
    "patient_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (domain && domain !== "localhost") parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

// ── Token extraction ──────────────────────────────────────────────

export function extractPatientCookieToken(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader) return null;
  const map = cookieHeader.split(";").reduce((acc, c) => {
    const idx = c.indexOf("=");
    if (idx > 0) {
      acc[c.slice(0, idx).trim()] = decodeURIComponent(c.slice(idx + 1).trim());
    }
    return acc;
  }, {} as Record<string, string>);
  return map["patient_session"] || null;
}

export function extractBearerToken(
  authHeader: string | null | undefined
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

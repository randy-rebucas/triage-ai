import { NextRequest, NextResponse } from "next/server";
import {
  buildPatientSessionCookie,
  buildClearPatientSessionCookie,
  signPatientToken,
} from "@/lib/auth/patientJwt";

// ─────────────────────────────────────────────────────────────────
// Patient API Proxy Client
//
// All patient auth calls are forwarded to the external myclinicsoft
// API (MYCLINICSOFT_API_URL).  The proxy re-sets the patient_session
// cookie on the local domain so it works in both local dev
// (localhost:3001 ↔ myclinicsoft.solutions) and in production
// (same domain, cookie is naturally shared).
//
// Flow:
//   Browser → local Next.js proxy route
//             → external myclinicsoft API (server-to-server)
//             ← JSON response + optional Set-Cookie from external
//   Proxy sets patient_session for the LOCAL domain and returns JSON.
// ─────────────────────────────────────────────────────────────────

const EXTERNAL_BASE =
  (process.env.MYCLINICSOFT_API_URL ?? "https://www.myclinicsoft.solutions")
    .replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────

export interface ProxyOptions {
  /** Forward the caller's auth cookie / Bearer header to the external API */
  forwardAuth?: boolean;
  /** If the external response contains a patient_session Set-Cookie, re-set it locally */
  relayCookie?: boolean;
  /** If true, relay the clear-cookie response on logout */
  clearCookie?: boolean;
}

// ── Core proxy helper ─────────────────────────────────────────────

/**
 * Forwards a request to the external patient API and returns a
 * NextResponse with the proxied body + correctly scoped cookie.
 */
export async function proxyPatientApi(
  req: NextRequest,
  externalPath: string,
  method: string,
  body?: unknown,
  opts: ProxyOptions = {}
): Promise<NextResponse> {
  const { forwardAuth = false, relayCookie = false, clearCookie = false } = opts;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept:         "application/json",
  };

  if (forwardAuth) {
    // Forward patient_session cookie to external API
    const cookie = req.headers.get("cookie");
    if (cookie) headers["Cookie"] = cookie;

    // Forward Bearer token
    const auth = req.headers.get("authorization");
    if (auth) headers["Authorization"] = auth;
  }

  let externalRes: Response;
  try {
    externalRes = await fetch(`${EXTERNAL_BASE}${externalPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Don't let fetch follow redirects automatically
      redirect: "manual",
    });
  } catch (err) {
    console.error(`[patientApiClient] Network error → ${externalPath}`, err);
    return NextResponse.json(
      { success: false, error: "The patient API is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }

  // ── Parse response body ──────────────────────────────────────────
  let responseBody: unknown;
  const contentType = externalRes.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try { responseBody = await externalRes.json(); }
    catch { responseBody = { success: false, error: "Unexpected response from patient API" }; }
  } else {
    responseBody = { success: false, error: "Unexpected response from patient API" };
  }

  // ── Build local response ─────────────────────────────────────────
  const localRes = NextResponse.json(responseBody, { status: externalRes.status });

  if (relayCookie) {
    // Extract the JWT from the external Set-Cookie header, decode its payload
    // (no signature check — the external API uses its own secret), then
    // re-sign a new JWT with the LOCAL SESSION_SECRET so our middleware can
    // verify it.  This prevents the "session_expired" redirect that would
    // happen if we stored the externally-signed token directly.
    const setCookieHeader = externalRes.headers.get("set-cookie") ?? "";
    const match = setCookieHeader.match(/patient_session=([^;]+)/i);
    if (match) {
      try {
        const rawToken   = decodeURIComponent(match[1]);
        const b64Payload = rawToken.split(".")[1];
        const jsonStr    = Buffer.from(b64Payload, "base64url").toString("utf8");
        const claims     = JSON.parse(jsonStr) as Record<string, unknown>;

        const localToken = signPatientToken({
          patientId:   String(claims.patientId   ?? claims.sub ?? ""),
          patientCode: String(claims.patientCode ?? ""),
          email:       String(claims.email       ?? ""),
        });

        localRes.headers.set("Set-Cookie", buildPatientSessionCookie(localToken));
      } catch (err) {
        console.error("[patientApiClient] Failed to re-sign patient token", err);
      }
    }
  }

  if (clearCookie) {
    localRes.headers.set("Set-Cookie", buildClearPatientSessionCookie());
  }

  return localRes;
}

// ── Convenience wrappers ──────────────────────────────────────────

export const patientPost = (
  req: NextRequest,
  path: string,
  body: unknown,
  opts?: ProxyOptions
) => proxyPatientApi(req, path, "POST", body, opts);

export const patientGet = (
  req: NextRequest,
  path: string,
  opts?: ProxyOptions
) => proxyPatientApi(req, path, "GET", undefined, opts);

export const patientDelete = (
  req: NextRequest,
  path: string,
  opts?: ProxyOptions
) => proxyPatientApi(req, path, "DELETE", undefined, opts);

export const patientPatch = (
  req: NextRequest,
  path: string,
  body: unknown,
  opts?: ProxyOptions
) => proxyPatientApi(req, path, "PATCH", body, opts);

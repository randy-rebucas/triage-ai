// ─────────────────────────────────────────────────────────────────
// external.ts — shared client-side helper for all calls that go to
// the external myclinicsoft API (NEXT_PUBLIC_MYCLINICSOFT_API_URL).
//
// Usage (inside client components):
//   import { externalFetch } from "@/lib/api/external";
//   const res = await externalFetch("/api/patients/auth/login", { ... });
//
// Falls back to relative URLs (local proxy) when the env var is
// absent, so development with local routes still works.
// ─────────────────────────────────────────────────────────────────

export const EXTERNAL_API =
  (process.env.NEXT_PUBLIC_MYCLINICSOFT_API_URL ?? "").replace(/\/$/, "");

/**
 * fetch() wrapper that prepends EXTERNAL_API to the path.
 * Accepts the same options as the native fetch API.
 */
export function externalFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${EXTERNAL_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * POST helper — JSON body automatically stringified.
 */
export function externalPost<T extends object>(
  path: string,
  body: T,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  return externalFetch(path, {
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify(body),
  });
}

/**
 * GET helper — optional URLSearchParams appended to path.
 */
export function externalGet(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<Response> {
  let url = path;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    if (qs) url += `?${qs}`;
  }
  return externalFetch(url, { method: "GET" });
}

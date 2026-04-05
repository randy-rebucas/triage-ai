import { NextRequest } from "next/server";
import { patientGet, patientDelete } from "@/lib/api/patientApiClient";

// ─────────────────────────────────────────────────────────────────
// GET    /api/patients/session  (proxy → external API)
// DELETE /api/patients/session  (proxy → external API)
//
// GET:    returns patient profile + optional ?include= data
// DELETE: logs out — clears patient_session cookie locally
// ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const include = req.nextUrl.searchParams.get("include");
  const path    = `/api/patients/session${include ? `?include=${include}` : ""}`;
  return patientGet(req, path, { forwardAuth: true });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return patientDelete(req, "/api/patients/session", {
    forwardAuth: true,
    clearCookie: true,
  });
}

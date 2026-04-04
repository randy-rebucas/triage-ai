import { NextRequest } from "next/server";
import { withAuth, type RouteContext } from "@/lib/api/withAuth";
import { getPatientProfile, updatePatientProfile } from "@/services/patientService";
import { getTenantId } from "@/lib/tenant";
import { patientUpdateSchema } from "@/lib/validations/schemas";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import type { IAuthPayload } from "@/types";

// ─────────────────────────────────────────────────────────────────
// GET  /api/patients/me — Get own patient profile
// PATCH /api/patients/me — Update own patient profile
// ─────────────────────────────────────────────────────────────────

async function getHandler(_req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const tenantId = user.tenantId || (await getTenantId());
    const profile = await getPatientProfile(user.userId, tenantId);
    if (!profile) return errorResponse("Patient profile not found", 404);
    return successResponse(profile);
  } catch (err) {
    console.error("[GET /api/patients/me]", err);
    return serverErrorResponse();
  }
}

async function patchHandler(req: NextRequest, user: IAuthPayload, _context: RouteContext): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = patientUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const tenantId = user.tenantId || (await getTenantId());
    const profile = await updatePatientProfile(user.userId, parsed.data, tenantId);
    return successResponse(profile, "Profile updated successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("not found")) return errorResponse(message, 404);
    console.error("[PATCH /api/patients/me]", err);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getHandler, ["patient"]);
export const PATCH = withAuth(patchHandler, ["patient"]);

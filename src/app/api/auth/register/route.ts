import { NextRequest } from "next/server";
import { registerUser } from "@/services/authService";
import { registerSchema } from "@/lib/validations/schemas";
import { buildSessionCookie } from "@/lib/auth/jwt";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { logAudit, getClientIP } from "@/services/auditService";
import { getTenantId } from "@/lib/tenant";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body includes optional tenantSlug for path-based multi-tenancy
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    // Resolve tenantId from slug in body, or fall back to header
    let tenantId: string | null = null;
    if (parsed.data.tenantSlug) {
      await connectDB();
      const tenant = await Tenant.findOne({
        subdomain: parsed.data.tenantSlug.toLowerCase(),
        status: "active",
      }).lean();
      if (!tenant) {
        return errorResponse("Clinic not found or inactive", 404, "TENANT_NOT_FOUND");
      }
      tenantId = (tenant as unknown as { _id: { toString(): string } })._id.toString();
    } else {
      tenantId = await getTenantId();
    }

    const result = await registerUser(parsed.data, tenantId);

    const response = successResponse(result, "Account created successfully", 201);
    response.headers.set("Set-Cookie", buildSessionCookie(result.token));

    logAudit({
      userId: result.user._id,
      userRole: result.user.role,
      action: "register",
      resource: "User",
      resourceId: result.user._id,
      ipAddress: getClientIP(req.headers),
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";

    if (message.includes("already exists")) {
      return errorResponse(message, 409, "EMAIL_TAKEN");
    }

    console.error("[/api/auth/register]", err);
    return serverErrorResponse(message);
  }
}

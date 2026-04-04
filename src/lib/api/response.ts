import { NextResponse } from "next/server";
import type { IApiSuccess, IApiError } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Standardised API Response Helpers
// All API routes use these to ensure consistent JSON shape.
// ─────────────────────────────────────────────────────────────────

export function successResponse<T>(
  data: T,
  message?: string,
  status = 200
): NextResponse<IApiSuccess<T>> {
  return NextResponse.json(
    {
      status: "success" as const,
      data,
      ...(message && { message }),
    },
    { status }
  );
}

export function errorResponse(
  error: string,
  status = 400,
  code?: string,
  details?: unknown
): NextResponse<IApiError> {
  return NextResponse.json(
    {
      status: "error" as const,
      error,
      ...(code && { code }),
      ...(details !== undefined && { details }),
    },
    { status }
  );
}

export function validationErrorResponse(
  errors: Record<string, string[]> | string
): NextResponse<IApiError> {
  return errorResponse(
    "Validation failed",
    422,
    "VALIDATION_ERROR",
    errors
  );
}

export function unauthorizedResponse(
  message = "Authentication required"
): NextResponse<IApiError> {
  return errorResponse(message, 401, "UNAUTHORIZED");
}

export function forbiddenResponse(
  message = "You do not have permission to access this resource"
): NextResponse<IApiError> {
  return errorResponse(message, 403, "FORBIDDEN");
}

export function notFoundResponse(
  resource = "Resource"
): NextResponse<IApiError> {
  return errorResponse(`${resource} not found`, 404, "NOT_FOUND");
}

export function serverErrorResponse(
  message = "An internal server error occurred"
): NextResponse<IApiError> {
  return errorResponse(message, 500, "INTERNAL_SERVER_ERROR");
}

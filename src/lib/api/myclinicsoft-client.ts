import axios from "axios";
import type { AxiosInstance, AxiosError } from "axios";

// ─────────────────────────────────────────────────────────────────
// MyClinicSoft External API Client (Axios)
//
// All tenant registry operations are routed through this client.
// Base URL is controlled by the MYCLINICSOFT_API_URL env variable.
//
//   Default: https://www.myclinicsoft.solutions
//   Local:   http://localhost:3000  (for dev with local DB)
// ─────────────────────────────────────────────────────────────────

const BASE_URL =
  (process.env.MYCLINICSOFT_API_URL ?? "https://www.myclinicsoft.solutions")
    .replace(/\/$/, "");

export const myclinicsoft: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: {
    "Accept":       "application/json",
    "Content-Type": "application/json",
  },
});

// ── Response / Error logging ───────────────────────────────────────

myclinicsoft.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url    = error.config?.url ?? "unknown";
    const status = error.response?.status ?? "no-response";
    console.error(`[myclinicsoft-client] ${error.config?.method?.toUpperCase()} ${url} → ${status}`);
    return Promise.reject(error);
  }
);

// ── Response types (mirrors TENANT_INTEGRATION_API.md) ────────────

export interface ExternalClinic {
  id:          string;
  name:        string;
  displayName: string;
  subdomain:   string;
  city:        string | null;
  state:       string | null;
  country:     string | null;
  logo:        string | null;
}

export interface ExternalSubscription {
  plan:          string | null;
  status:        string | null;
  billingCycle:  string | null;
  isActive:      boolean;
  isTrial:       boolean;
  isExpired:     boolean;
  expiresAt:     string | null;
  daysRemaining: number | null;
}

export interface ExternalTenantDetail extends ExternalClinic {
  status: string;
}

export interface DirectoryResponse {
  success:    boolean;
  data:       ExternalClinic[];
  pagination: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
  };
}

export interface ValidateResponse {
  success:      boolean;
  valid:        true;
  tenant:       ExternalTenantDetail;
  subscription: ExternalSubscription;
}

export interface ValidateInvalidResponse {
  success: boolean;
  valid:   false;
  reason:  string;
  message: string;
}

export type ValidationResult = ValidateResponse | ValidateInvalidResponse;

// ── API functions ─────────────────────────────────────────────────

const EMPTY_DIRECTORY: DirectoryResponse = {
  success:    true,
  data:       [],
  pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
};

/**
 * Paginated, searchable list of active clinics.
 * GET /api/tenants/directory
 *
 * Returns an empty result set instead of throwing when the
 * external registry is unreachable or returns a non-2xx status.
 */
export async function fetchTenantDirectory(params?: {
  search?: string;
  city?:   string;
  page?:   number;
  limit?:  number;
}): Promise<DirectoryResponse> {
  try {
    const { data } = await myclinicsoft.get<DirectoryResponse>(
      "/api/tenants/directory",
      { params }
    );
    return data;
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    console.error(`[fetchTenantDirectory] External registry error (HTTP ${status ?? "no-response"})`);
    return EMPTY_DIRECTORY;
  }
}

/**
 * Validate a clinic by subdomain — checks active status + subscription.
 *
 * Per the API spec this always resolves (HTTP 200).
 * On network / registry errors it resolves to { valid: false } so
 * callers never need a try/catch.
 *
 * GET /api/tenants/validate?subdomain=...
 */
export async function fetchTenantValidation(
  subdomain: string
): Promise<ValidationResult> {
  try {
    const { data } = await myclinicsoft.get<ValidationResult>(
      "/api/tenants/validate",
      { params: { subdomain } }
    );
    return data;
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    console.error(`[fetchTenantValidation] Registry error for "${subdomain}" (HTTP ${status ?? "no-response"})`);
    return {
      success: false,
      valid:   false,
      reason:  "registry_unavailable",
      message: "The tenant registry is temporarily unavailable.",
    };
  }
}

/**
 * Look up a single clinic by subdomain (public info only).
 * Returns null if the clinic is not found or inactive.
 * GET /api/tenants/public?subdomain=...
 */
export async function fetchTenantBySubdomain(
  subdomain: string
): Promise<ExternalClinic | null> {
  try {
    const { data } = await myclinicsoft.get<{ success: boolean; data: ExternalClinic }>(
      "/api/tenants/public",
      { params: { subdomain } }
    );
    return data.data ?? null;
  } catch {
    return null;
  }
}

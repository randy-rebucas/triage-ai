import { NextRequest } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import Settings from "@/models/Settings";
import { RESERVED_SUBDOMAINS, SUBDOMAIN_REGEX } from "@/models/Tenant";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  serverErrorResponse,
} from "@/lib/api/response";

// ─────────────────────────────────────────────────────────────────
// POST /api/tenants/onboard
// Self-service clinic registration. Rate-limited (5 req / 15 min per IP).
// Creates: Tenant → Settings → Admin User (as per MULTI_TENANCY.md §8)
// ─────────────────────────────────────────────────────────────────

const onboardSchema = z.object({
  name: z.string().min(2, "Clinic name must be at least 2 characters"),
  subdomain: z
    .string()
    .min(2)
    .max(63)
    .toLowerCase()
    .refine((s) => SUBDOMAIN_REGEX.test(s), {
      message:
        "Subdomain may only contain lowercase letters, numbers, and hyphens",
    })
    .refine((s) => !RESERVED_SUBDOMAINS.includes(s), {
      message: "This subdomain name is reserved",
    }),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  settings: z
    .object({
      timezone: z.string().optional(),
      currency: z.string().optional(),
      dateFormat: z.string().optional(),
    })
    .optional(),
  admin: z.object({
    name: z.string().min(2, "Admin name is required"),
    email: z.string().email("Valid admin email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().optional(),
  }),
});

// Simple in-memory rate limiter (IP → [timestamps])
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateLimitMap.get(ip) || []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > RATE_LIMIT;
}

export async function POST(req: NextRequest): Promise<Response> {
  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(ip)) {
    return errorResponse("Too many requests. Try again in 15 minutes.", 429, "RATE_LIMITED");
  }

  try {
    const body = await req.json();
    const parsed = onboardSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const { name, subdomain, displayName, email, phone, address, settings, admin } =
      parsed.data;

    await connectDB();

    // Check subdomain uniqueness
    const existingTenant = await Tenant.findOne({ subdomain });
    if (existingTenant) {
      return errorResponse("This subdomain is already taken.", 400, "SUBDOMAIN_TAKEN");
    }

    // Check admin email global uniqueness
    const existingUser = await User.findOne({ email: admin.email.toLowerCase() });
    if (existingUser) {
      return errorResponse(
        "An account with this email already exists.",
        400,
        "EMAIL_TAKEN"
      );
    }

    // ── 1. Create Tenant ─────────────────────────────────────────
    const trialExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const tenant = await Tenant.create({
      name,
      subdomain,
      displayName,
      email,
      phone,
      address,
      settings: {
        timezone: settings?.timezone || "UTC",
        currency: settings?.currency || "PHP",
        dateFormat: settings?.dateFormat || "MM/DD/YYYY",
      },
      status: "active",
      subscription: {
        plan: "trial",
        status: "active",
        expiresAt: trialExpiry,
      },
    });

    const tenantId = tenant._id as Types.ObjectId;

    // ── 2. Create Admin User ─────────────────────────────────────
    const adminUser = await User.create({
      email: admin.email.toLowerCase(),
      password: admin.password, // pre-save hook hashes it
      name: admin.name,
      role: "doctor", // Admin of a clinic gets doctor role by default
      tenantId,
      isActive: true,
    });

    // ── 3. Create Settings singleton ──────────────────────────────
    await Settings.create({
      tenantId,
      clinicName: displayName || name,
      clinicEmail: email,
      clinicPhone: phone,
      clinicAddress: address
        ? [address.street, address.city, address.country]
            .filter(Boolean)
            .join(", ")
        : undefined,
      timezone: settings?.timezone || "UTC",
      currency: settings?.currency || "PHP",
      dateFormat: settings?.dateFormat || "MM/DD/YYYY",
    });

    return successResponse(
      {
        success: true,
        message: "Tenant created successfully",
        name: tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
        adminEmail: adminUser.email,
        subscription: {
          plan: tenant.subscription.plan,
          status: tenant.subscription.status,
          expiresAt: tenant.subscription.expiresAt,
        },
      },
      "Clinic registered successfully",
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";

    if (message.includes("duplicate key") || message.includes("already taken")) {
      return errorResponse("This subdomain is already taken.", 400, "SUBDOMAIN_TAKEN");
    }

    console.error("[POST /api/tenants/onboard]", err);
    return serverErrorResponse(message);
  }
}

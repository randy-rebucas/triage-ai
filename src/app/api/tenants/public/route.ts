import { NextRequest, NextResponse } from "next/server";
import { notFoundResponse, serverErrorResponse } from "@/lib/api/response";
import connectDB from "@/lib/db/mongodb";
import Tenant from "@/models/Tenant";

// ─────────────────────────────────────────────────────────────────
// GET /api/tenants/public
//
// Public tenant lookup — no auth required.
//
//   GET /api/tenants/public?subdomain=clinic-a   → single active tenant
//   GET /api/tenants/public                      → all active tenants (max 200)
// ─────────────────────────────────────────────────────────────────

function toPublicShape(t: {
  _id: unknown;
  name: string;
  displayName?: string;
  subdomain: string;
  address?: { city?: string; state?: string; country?: string };
  settings?: { logo?: string };
}) {
  return {
    id:          (t._id as { toString(): string }).toString(),
    name:        t.name,
    displayName: t.displayName ?? t.name,
    subdomain:   t.subdomain,
    city:        t.address?.city    ?? null,
    state:       t.address?.state   ?? null,
    country:     t.address?.country ?? null,
    logo:        t.settings?.logo   ?? null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const subdomain = searchParams.get("subdomain")?.toLowerCase();

    if (subdomain) {
      const tenant = await Tenant.findOne({ subdomain, status: "active" })
        .select("name displayName subdomain address settings.logo")
        .lean();
      if (!tenant) return notFoundResponse("Tenant") as NextResponse;
      return NextResponse.json({ success: true, data: toPublicShape(tenant) });
    }

    const tenants = await Tenant.find({ status: "active" })
      .select("name displayName subdomain address settings.logo")
      .sort({ name: 1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        tenants: tenants.map(toPublicShape),
        total:   tenants.length,
      },
    });
  } catch (err) {
    console.error("[GET /api/tenants/public]", err);
    return serverErrorResponse() as NextResponse;
  }
}

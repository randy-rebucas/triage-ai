import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { Navbar } from "@/components/layout/Navbar";
import { getUserById } from "@/services/authService";

// ─────────────────────────────────────────────────────────────────
// Patient Layout — /{tenant}/patient/*
// Auth guard: validates session and ensures patient role.
// ─────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function PatientLayout({ children, params }: Props) {
  const { tenant } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());

  if (!token) redirect(`/${tenant}/login`);

  let user;
  try {
    const payload = verifyToken(token);
    if (payload.role !== "patient") redirect(`/${tenant}/doctor/dashboard`);
    user = await getUserById(payload.userId);
  } catch {
    redirect(`/${tenant}/login`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userName={user?.name} userRole="patient" tenantSlug={tenant} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

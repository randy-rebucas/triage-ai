import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";

// ─────────────────────────────────────────────────────────────────
// Clinic Entry Page — /{tenant}
//
// Pure redirect: checks the session cookie and sends the user to
// the appropriate page. No UI is rendered.
//
//   Authenticated patient  → /{tenant}/patient/profile
//   Authenticated doctor   → /{tenant}/doctor/dashboard
//   No valid session       → /{tenant}/login
// ─────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ tenant: string }>;
}

export default async function ClinicEntryPage({ params }: Props) {
  const { tenant } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());

  if (!token) {
    redirect(`/${tenant}/login`);
  }

  try {
    const payload = verifyToken(token);
    if (payload.role === "patient") {
      redirect(`/${tenant}/patient/profile`);
    } else {
      redirect(`/${tenant}/doctor/dashboard`);
    }
  } catch {
    // Expired or invalid token — send to login
    redirect(`/${tenant}/login`);
  }
}

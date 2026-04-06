import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// ─────────────────────────────────────────────────────────────────
// Clinic Entry Page — /{tenant}
//
// Redirects to patient profile if a patient_session cookie exists,
// otherwise sends to the login page.
// ─────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ tenant: string }>;
}

export default async function ClinicEntryPage({ params }: Props) {
  const { tenant }   = await params;
  const cookieStore  = await cookies();
  const token        = cookieStore.get("patient_session")?.value;

  if (token) {
    redirect(`/${tenant}/patient/dashboard`);
  }

  redirect(`/${tenant}/login`);
}

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Navbar } from "@/components/layout/Navbar";

// ─────────────────────────────────────────────────────────────────
// Patient Layout — /{tenant}/patient/*
//
// The middleware has already verified the patient_session JWT and
// injected x-user-email and x-patient-code into the request headers.
// We read those here instead of re-parsing the cookie.
// ─────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
  params:   Promise<{ tenant: string }>;
}

export default async function PatientLayout({ children, params }: Props) {
  const { tenant } = await params;

  const headerStore  = await headers();
  const email        = headerStore.get("x-user-email");
  const patientCode  = headerStore.get("x-patient-code");

  // If middleware didn't inject these, the patient isn't authenticated.
  if (!email && !patientCode) redirect(`/${tenant}/login`);

  const displayName = email || patientCode || "Patient";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userName={displayName} tenantSlug={tenant} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

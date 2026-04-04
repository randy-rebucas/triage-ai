import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getTriageSession } from "@/services/triageService";
import { ReportCard } from "@/components/patient/ReportCard";
import { Button } from "@/components/ui/Button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Assessment Report" };

interface Props { params: Promise<{ tenant: string; sessionId: string }> }

export default async function PatientReportDetailPage({ params }: Props) {
  const { tenant, sessionId } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  let session;
  try {
    session = await getTriageSession(sessionId, payload.userId, "patient", tenantId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href={`/${tenant}/patient/reports`}>
          <Button variant="ghost" size="sm">← Back to Reports</Button>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Assessment Report</h1>
      </div>
      <ReportCard session={session} role="patient" />
    </div>
  );
}

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getTriageSession } from "@/services/triageService";
import { ReportCard } from "@/components/patient/ReportCard";
import { Button } from "@/components/ui/Button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Assessment Report" };

interface Props { params: Promise<{ tenant: string; sessionId: string }> }

export default async function PatientReportDetailPage({ params }: Props) {
  const { tenant, sessionId } = await params;
  const headerStore           = await headers();
  const patientCode           = headerStore.get("x-patient-code") ?? "";
  const tenantId              = await getTenantId();

  let session;
  try {
    session = await getTriageSession(sessionId, patientCode, "patient", tenantId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href={`/${tenant}/patient/reports`}>
          <Button variant="ghost" size="sm">← Back to Reports</Button>
        </Link>
      </div>
      <ReportCard session={session} />
    </div>
  );
}

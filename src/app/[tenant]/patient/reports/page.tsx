import { headers } from "next/headers";
import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getPatientTriageSessions } from "@/services/triageService";
import { Card } from "@/components/ui/Card";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatSessionStatus, sessionStatusVariant } from "@/lib/formatters";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "My Reports" };

interface Props { params: Promise<{ tenant: string }> }

export default async function PatientReportsPage({ params }: Props) {
  const { tenant }     = await params;
  const headerStore    = await headers();
  const patientCode    = headerStore.get("x-patient-code") ?? "";
  const tenantId       = await getTenantId();

  const { sessions, total } = await getPatientTriageSessions(patientCode, tenantId, 1, 20);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
        <p className="mt-1 text-gray-500">{total} assessment{total !== 1 ? "s" : ""} on record</p>
      </div>

      {sessions.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-semibold text-gray-900 text-lg mb-2">No reports yet</p>
          <p className="text-sm text-gray-500 mb-6">
            Complete a symptom assessment to see your report here.
          </p>
          <Link href={`/${tenant}/patient/triage`}>
            <Button>Start Your First Assessment →</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link key={session._id} href={`/${tenant}/patient/reports/${session._id}`}>
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{session.chiefComplaint}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      <span className="text-xs sm:text-sm text-gray-500">
                        <span className="sm:hidden">{format(new Date(session.createdAt), "MMM d, yyyy")}</span>
                        <span className="hidden sm:inline">{format(new Date(session.createdAt), "MMMM d, yyyy 'at' h:mm a")}</span>
                      </span>
                      {session.status === "reviewed" && (
                        <span className="text-xs text-green-600 font-medium">✓ Reviewed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0 justify-end">
                    <RiskBadge level={session.riskLevel} />
                    <Badge variant={sessionStatusVariant(session.status)}>
                      {formatSessionStatus(session.status)}
                    </Badge>
                    <span className="text-gray-400 hidden sm:inline">→</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

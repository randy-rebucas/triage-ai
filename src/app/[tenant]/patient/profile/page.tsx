import { headers } from "next/headers";
import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getPatientTriageSessions } from "@/services/triageService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { formatSessionStatus, sessionStatusVariant } from "@/lib/formatters";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "My Profile" };

interface Props { params: Promise<{ tenant: string }> }

export default async function PatientProfilePage({ params }: Props) {
  const { tenant }     = await params;
  const headerStore    = await headers();
  const patientCode    = headerStore.get("x-patient-code") ?? "";
  const email          = headerStore.get("x-user-email")   ?? "";
  const tenantId       = await getTenantId();

  const { sessions, total } = await getPatientTriageSessions(patientCode, tenantId, 1, 5);

  const criticalSessions = sessions.filter(
    (s) => s.riskLevel === "critical" || s.riskLevel === "high"
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-gray-500">Your health information and assessment history.</p>
      </div>

      {criticalSessions.length > 0 && (
        <Alert variant="emergency" title="Urgent Medical Attention Needed">
          A recent assessment flagged high-risk symptoms. Please consult a
          healthcare professional or seek emergency care if symptoms worsen.
        </Alert>
      )}

      {/* Identity card */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-blue-100 text-xl sm:text-2xl font-bold text-blue-700 flex-shrink-0">
            {email?.[0]?.toUpperCase() || "P"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 break-all">{email || patientCode}</h2>
            {patientCode && (
              <p className="text-sm font-mono text-gray-400 mt-0.5 truncate">{patientCode}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Start assessment CTA */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Ready for your assessment?</h3>
            <p className="text-sm text-gray-500 mt-1">
              Describe your symptoms to our AI assistant and get a preliminary report.
            </p>
          </div>
          <Link href={`/${tenant}/patient/triage`} className="flex-shrink-0">
            <Button size="lg" className="w-full sm:w-auto">Start New Assessment →</Button>
          </Link>
        </div>
      </Card>

      {/* Recent sessions */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Assessments
            {total > 0 && <span className="ml-2 text-sm font-normal text-gray-400">({total} total)</span>}
          </h2>
          {total > 5 && (
            <Link href={`/${tenant}/patient/reports`} className="self-start sm:self-auto">
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          )}
        </div>

        {sessions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">📋</div>
            <p className="font-semibold text-gray-900 mb-1">No assessments yet</p>
            <p className="text-sm text-gray-500">
              Your symptom assessments will appear here after your first session.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link key={session._id} href={`/${tenant}/patient/reports/${session._id}`}>
                <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{session.chiefComplaint}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-500">
                          {format(new Date(session.createdAt), "MMMM d, yyyy")}
                        </span>
                        {session.status === "reviewed" && (
                          <span className="text-xs text-green-600 font-medium">✓ Reviewed</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <RiskBadge level={session.riskLevel} />
                      <Badge variant={sessionStatusVariant(session.status)}>
                        {formatSessionStatus(session.status)}
                      </Badge>
                      <span className="text-gray-400 text-sm">→</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

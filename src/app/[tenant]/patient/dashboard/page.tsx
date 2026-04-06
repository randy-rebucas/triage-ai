import { headers } from "next/headers";
import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getPatientTriageSessions } from "@/services/triageService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Patient Dashboard" };

interface Props { params: Promise<{ tenant: string }> }

export default async function PatientDashboardPage({ params }: Props) {
  const { tenant }     = await params;
  const headerStore    = await headers();
  const patientCode    = headerStore.get("x-patient-code") ?? "";
  const email          = headerStore.get("x-user-email")   ?? "";
  const tenantId       = await getTenantId();

  const { sessions, total } = await getPatientTriageSessions(patientCode, tenantId, 1, 5);

  const criticalSessions = sessions.filter(
    (s) => s.riskLevel === "critical" || s.riskLevel === "high"
  );

  const riskCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.riskLevel] = (acc[s.riskLevel] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{email ? `, ${email.split("@")[0]}` : ""}
        </h1>
        <p className="mt-1 text-gray-500">Here&apos;s a summary of your health assessments.</p>
      </div>

      {criticalSessions.length > 0 && (
        <Alert variant="emergency" title="Action Required">
          You have {criticalSessions.length} high-risk assessment
          {criticalSessions.length !== 1 ? "s" : ""} that may need medical attention.
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Assessments" value={total} />
        <StatCard label="High Risk" value={(riskCounts["critical"] ?? 0) + (riskCounts["high"] ?? 0)} highlight />
        <StatCard label="Reviewed" value={sessions.filter((s) => s.status === "reviewed").length} />
      </div>

      {/* Recent sessions */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Assessments</h2>
          {total > 5 && (
            <Link href={`/${tenant}/patient/reports`} className="self-start sm:self-auto">
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          )}
        </div>

        {sessions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">🩺</div>
            <p className="font-semibold text-gray-900 mb-2">No assessments yet</p>
            <p className="text-sm text-gray-500 mb-6">
              Start your first AI-guided triage to get a pre-consultation report.
            </p>
            <Link href={`/${tenant}/patient/triage`}>
              <Button>Start Assessment</Button>
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
                      <span className="text-xs sm:text-sm text-gray-500">
                        {format(new Date(session.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0 justify-end">
                      <RiskBadge level={session.riskLevel} />
                      <Badge variant={session.status === "reviewed" ? "success" : session.status === "pending_review" ? "info" : "default"}>
                        {session.status === "reviewed" ? "Reviewed" : session.status === "pending_review" ? "Pending" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <Card className="border-blue-200 bg-blue-50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Start a new assessment</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Describe your symptoms and receive an AI-generated report.
            </p>
          </div>
          <Link href={`/${tenant}/patient/triage`} className="flex-shrink-0">
            <Button className="w-full sm:w-auto">Start Assessment →</Button>
          </Link>
        </div>
      </Card>

      <p className="text-xs text-gray-400 text-center">
        AI assessments are for pre-consultation reference only and do not replace
        professional medical advice.
      </p>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight && value > 0 ? "border-red-200 bg-red-50" : ""}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${highlight && value > 0 ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </p>
    </Card>
  );
}

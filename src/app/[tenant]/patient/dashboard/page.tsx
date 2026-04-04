import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getPatientTriageSessions } from "@/services/triageService";
import { getPatientProfile } from "@/services/patientService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Patient Dashboard" };

interface Props { params: Promise<{ tenant: string }> }

export default async function PatientDashboardPage({ params }: Props) {
  const { tenant } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  const [profile, { sessions, total }] = await Promise.all([
    getPatientProfile(payload.userId, tenantId),
    getPatientTriageSessions(payload.userId, tenantId, 1, 5),
  ]);

  const hasProfile = !!profile?.dateOfBirth;
  const criticalSessions = sessions.filter(
    (s) => s.riskLevel === "critical" || s.riskLevel === "high"
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.user?.name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="mt-1 text-gray-500">
          {total === 0
            ? "Start your first symptom assessment below."
            : `You have ${total} assessment${total !== 1 ? "s" : ""} on record.`}
        </p>
      </div>

      {!hasProfile && (
        <Alert variant="warning" title="Complete Your Profile">
          Please complete your health profile before starting an assessment.
          <div className="mt-2">
            <Button variant="outline" size="sm">Complete Profile</Button>
          </div>
        </Alert>
      )}

      {criticalSessions.length > 0 && (
        <Alert variant="emergency" title="Urgent Medical Attention Needed">
          Your recent assessment flagged high-risk symptoms. Please consult your
          doctor or seek emergency care if symptoms worsen.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white text-xl flex-shrink-0">🩺</div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Start Assessment</h3>
              <p className="text-sm text-gray-500 mt-0.5">Describe your symptoms to our AI assistant</p>
            </div>
          </div>
          <div className="mt-4">
            <Link href={`/${tenant}/patient/triage`}>
              <Button className="w-full" disabled={!hasProfile}>Begin Symptom Check</Button>
            </Link>
          </div>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl flex-shrink-0">📋</div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">My Reports</h3>
              <p className="text-sm text-gray-500 mt-0.5">View all your past assessments</p>
            </div>
          </div>
          <div className="mt-4">
            <Link href={`/${tenant}/patient/reports`}>
              <Button variant="outline" className="w-full">View Reports ({total})</Button>
            </Link>
          </div>
        </Card>
      </div>

      {sessions.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Assessments</h2>
            <Link href={`/${tenant}/patient/reports`}>
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {sessions.map((session) => (
              <Link key={session._id} href={`/${tenant}/patient/reports/${session._id}`}
                className="flex items-center justify-between py-4 hover:bg-gray-50 -mx-6 px-6 transition-colors rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{session.chiefComplaint}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {format(new Date(session.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <RiskBadge level={session.riskLevel} />
                  <Badge variant={session.status === "validated" ? "success" : session.status === "completed" ? "info" : "default"}>
                    {session.status === "validated" ? "Reviewed" : session.status === "completed" ? "Pending" : "Draft"}
                  </Badge>
                  <span className="text-gray-400 text-sm">→</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {sessions.length === 0 && (
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🏥</div>
          <h3 className="font-semibold text-gray-900 mb-2">No assessments yet</h3>
          <p className="text-gray-500 mb-6 text-sm">Start your first AI-powered symptom assessment</p>
          <Link href={`/${tenant}/patient/triage`}>
            <Button>Start Assessment</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}

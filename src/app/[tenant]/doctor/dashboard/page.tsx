import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getUserById } from "@/services/authService";
import { getPendingReviews } from "@/services/triageService";
import { getAllPatients } from "@/services/patientService";
import { Card } from "@/components/ui/Card";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Doctor Dashboard" };

interface Props { params: Promise<{ tenant: string }> }

export default async function DoctorDashboardPage({ params }: Props) {
  const { tenant } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  const [user, { sessions: pendingSessions, total: totalPending }, { total: totalPatients }] =
    await Promise.all([
      getUserById(payload.userId),
      getPendingReviews(tenantId, 1, 10),
      getAllPatients(tenantId, 1, 1),
    ]);

  const criticalCases = pendingSessions.filter((s) => s.riskLevel === "critical");
  const highCases = pendingSessions.filter((s) => s.riskLevel === "high");

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good {getGreeting()}, Dr. {user?.name?.split(" ").pop()}
        </h1>
        <p className="mt-1 text-gray-500">
          {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {criticalCases.length > 0 && (
        <Alert variant="emergency" title={`${criticalCases.length} CRITICAL Case${criticalCases.length > 1 ? "s" : ""} Requiring Immediate Attention`}>
          {criticalCases.length} patient{criticalCases.length > 1 ? "s" : ""} {criticalCases.length > 1 ? "have" : "has"} been flagged as critical risk.
          <div className="mt-2">
            <Button size="sm" variant="danger">Review Critical Cases</Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending Reviews" value={totalPending} icon="📬"
          variant={totalPending > 0 ? "warning" : "default"}
          href={`/${tenant}/doctor/dashboard#pending`} />
        <StatCard label="Critical Cases" value={criticalCases.length} icon="🚨"
          variant={criticalCases.length > 0 ? "critical" : "default"} />
        <StatCard label="High Risk Cases" value={highCases.length} icon="⚠️"
          variant={highCases.length > 0 ? "warning" : "default"} />
        <StatCard label="Total Patients" value={totalPatients} icon="👥"
          variant="default" href={`/${tenant}/doctor/patients`} />
      </div>

      <div id="pending">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Pending Reviews</h2>
          <Link href={`/${tenant}/doctor/patients`}>
            <Button variant="ghost" size="sm">All Patients →</Button>
          </Link>
        </div>

        {pendingSessions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium text-gray-900">All caught up!</p>
            <p className="text-sm text-gray-500 mt-1">No triage sessions pending review</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingSessions.map((session) => (
              <Link key={session._id} href={`/${tenant}/doctor/triage/${session._id}`}>
                <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <RiskBadge level={session.riskLevel} score={session.riskScore} />
                        {session.safetyFlags?.length > 0 && (
                          <Badge variant="warning" size="sm">
                            {session.safetyFlags.length} flag{session.safetyFlags.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-gray-900 truncate">{session.chiefComplaint}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Submitted {format(new Date(session.createdAt), "MMM d 'at' h:mm a")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0">Review →</Button>
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

function StatCard({ label, value, icon, variant = "default", href }: {
  label: string; value: number; icon: string;
  variant?: "default" | "warning" | "critical"; href?: string;
}) {
  const styles = {
    default: "bg-white border-gray-200",
    warning: "bg-amber-50 border-amber-200",
    critical: "bg-red-50 border-red-200 animate-pulse-slow",
  };
  const content = (
    <Card className={`${styles[variant]} transition-shadow hover:shadow-md`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className={`text-2xl font-bold ${variant === "critical" ? "text-red-700" : variant === "warning" ? "text-amber-700" : "text-gray-900"}`}>
            {value}
          </p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

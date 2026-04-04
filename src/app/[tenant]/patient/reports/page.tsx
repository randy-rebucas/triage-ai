import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getPatientTriageSessions } from "@/services/triageService";
import { Card } from "@/components/ui/Card";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "My Reports" };

interface Props { params: Promise<{ tenant: string }> }

export default async function PatientReportsPage({ params }: Props) {
  const { tenant } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());
  const { sessions, total } = await getPatientTriageSessions(payload.userId, tenantId, 1, 20);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
        <p className="mt-1 text-gray-500">{total} assessment{total !== 1 ? "s" : ""} on record</p>
      </div>

      {sessions.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="font-semibold text-gray-900 mb-2">No reports yet</h3>
          <p className="text-gray-500 text-sm mb-6">Complete a symptom assessment to see your first report</p>
          <Link href={`/${tenant}/patient/triage`}><Button>Start Assessment</Button></Link>
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
                      {session.status === "validated" && (
                        <span className="text-xs text-green-600 font-medium">✓ Doctor reviewed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <RiskBadge level={session.riskLevel} />
                    <Badge variant={session.status === "validated" ? "success" : session.status === "completed" ? "info" : "default"}>
                      {session.status === "validated" ? "Reviewed" : session.status === "completed" ? "Pending" : "In Progress"}
                    </Badge>
                    <span className="text-gray-400">→</span>
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

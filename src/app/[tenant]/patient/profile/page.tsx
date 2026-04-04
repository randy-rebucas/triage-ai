import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getPatientProfile } from "@/services/patientService";
import { getPatientTriageSessions } from "@/services/triageService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import type { Metadata } from "next";
import { format, differenceInYears } from "date-fns";

export const metadata: Metadata = { title: "My Profile" };

interface Props { params: Promise<{ tenant: string }> }

export default async function PatientProfilePage({ params }: Props) {
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

  const age = profile?.dateOfBirth
    ? differenceInYears(new Date(), new Date(profile.dateOfBirth))
    : null;

  const criticalSessions = sessions.filter(
    (s) => s.riskLevel === "critical" || s.riskLevel === "high"
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-gray-500">Your health information and assessment history.</p>
      </div>

      {/* Critical alert */}
      {criticalSessions.length > 0 && (
        <Alert variant="emergency" title="Urgent Medical Attention Needed">
          A recent assessment flagged high-risk symptoms. Please consult your
          doctor or seek emergency care if symptoms worsen.
        </Alert>
      )}

      {/* Profile info card */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-100 text-3xl font-bold text-blue-700 flex-shrink-0">
            {profile?.user?.name?.[0]?.toUpperCase() || "?"}
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {profile?.user?.name || "—"}
              </h2>
              <p className="text-gray-500 text-sm mt-0.5">{profile?.user?.email}</p>
            </div>

            {profile?.dateOfBirth ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <InfoItem label="Age" value={age ? `${age} years` : "—"} />
                <InfoItem
                  label="Date of Birth"
                  value={format(new Date(profile.dateOfBirth), "MMM d, yyyy")}
                />
                <InfoItem
                  label="Gender"
                  value={profile.gender ? capitalize(profile.gender) : "—"}
                />
                <InfoItem label="Contact" value={profile.contactNumber || "—"} />
                {profile.bloodType && (
                  <InfoItem label="Blood Type" value={profile.bloodType} />
                )}
              </div>
            ) : (
              <Alert variant="warning" title="Profile incomplete">
                Add your health details to get more accurate AI triage results.
              </Alert>
            )}
          </div>
        </div>

        {/* Allergies */}
        {profile?.allergies && profile.allergies.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Known Allergies
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.allergies.map((a, i) => (
                <span
                  key={i}
                  className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Medical history */}
        {profile?.medicalHistory && profile.medicalHistory.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Medical History
            </p>
            <ul className="space-y-1">
              {profile.medicalHistory.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Start assessment CTA */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">
              Ready for your assessment?
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Describe your symptoms to our AI assistant and get a preliminary
              report for your doctor.
            </p>
          </div>
          <Link href={`/${tenant}/patient/triage`} className="flex-shrink-0">
            <Button size="lg" className="w-full sm:w-auto">
              Start New Assessment →
            </Button>
          </Link>
        </div>
      </Card>

      {/* Recent sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Assessments
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({total} total)
              </span>
            )}
          </h2>
          {total > 5 && (
            <Link href={`/${tenant}/patient/reports`}>
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
              <Link
                key={session._id}
                href={`/${tenant}/patient/reports/${session._id}`}
              >
                <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">
                        {session.chiefComplaint}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-500">
                          {format(new Date(session.createdAt), "MMMM d, yyyy")}
                        </span>
                        {session.status === "validated" && (
                          <span className="text-xs text-green-600 font-medium">
                            ✓ Doctor reviewed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <RiskBadge level={session.riskLevel} />
                      <Badge
                        variant={
                          session.status === "validated"
                            ? "success"
                            : session.status === "completed"
                            ? "info"
                            : "default"
                        }
                      >
                        {session.status === "validated"
                          ? "Reviewed"
                          : session.status === "completed"
                          ? "Pending"
                          : "Draft"}
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

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getPatientById } from "@/services/patientService";
import { getPatientTriageSessions } from "@/services/triageService";
import { getPatientRecords } from "@/services/recordService";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, RiskBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Metadata } from "next";
import { format, differenceInYears } from "date-fns";

export const metadata: Metadata = { title: "Patient Detail" };

interface Props { params: Promise<{ tenant: string; patientId: string }> }

export default async function PatientDetailPage({ params }: Props) {
  const { tenant, patientId } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  const patient = await getPatientById(patientId, tenantId);
  if (!patient) notFound();

  const [{ sessions }, { records }] = await Promise.all([
    getPatientTriageSessions(patient.userId.toString(), tenantId, 1, 5),
    getPatientRecords(patientId, payload.userId, payload.role, tenantId, 1, 5),
  ]);

  const age = patient.dateOfBirth
    ? differenceInYears(new Date(), new Date(patient.dateOfBirth))
    : null;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href={`/${tenant}/doctor/patients`}>
          <Button variant="ghost" size="sm">← Back to Patients</Button>
        </Link>
      </div>

      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-100 text-3xl font-bold text-blue-700 flex-shrink-0">
            {patient.user?.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{patient.user?.name}</h1>
              {patient.bloodType && <Badge variant="info">{patient.bloodType}</Badge>}
            </div>
            <p className="text-gray-500 mt-1">{patient.user?.email}</p>
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-600">
              {age && <span>Age: <strong>{age}</strong></span>}
              <span>Gender: <strong className="capitalize">{patient.gender}</strong></span>
              {patient.contactNumber && <span>Contact: <strong>{patient.contactNumber}</strong></span>}
              {patient.dateOfBirth && (
                <span>DOB: <strong>{format(new Date(patient.dateOfBirth), "MMM d, yyyy")}</strong></span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {patient.allergies?.length > 0 && (
            <Alert variant="warning" title="Known Allergies">
              <ul className="mt-1 list-disc list-inside">
                {patient.allergies.map((a, i) => <li key={i} className="text-sm">{a}</li>)}
              </ul>
            </Alert>
          )}
          <Card>
            <CardHeader><CardTitle>Medical History</CardTitle></CardHeader>
            {patient.medicalHistory?.length ? (
              <ul className="space-y-1">
                {patient.medicalHistory.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-400 mt-0.5">•</span>
                    <span className="text-gray-700">{h}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-400">No medical history on record</p>}
          </Card>
          {patient.emergencyContact && (
            <Card>
              <CardHeader><CardTitle>Emergency Contact</CardTitle></CardHeader>
              <div className="text-sm space-y-1 text-gray-700">
                <p><strong>{patient.emergencyContact.name}</strong> ({patient.emergencyContact.relationship})</p>
                <p>{patient.emergencyContact.contactNumber}</p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Recent Triage Sessions</CardTitle></CardHeader>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400">No triage sessions yet</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <Link key={session._id} href={`/${tenant}/doctor/triage/${session._id}`}
                    className="flex items-center justify-between py-2 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{session.chiefComplaint}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{format(new Date(session.createdAt), "MMM d, yyyy")}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <RiskBadge level={session.riskLevel} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Clinical Records</CardTitle></CardHeader>
            {records.length === 0 ? (
              <p className="text-sm text-gray-400">No clinical records yet</p>
            ) : (
              <div className="space-y-2">
                {records.map((record) => (
                  <Link key={record._id} href={`/${tenant}/doctor/records/${record._id}`}
                    className="flex items-center justify-between py-2 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{record.diagnosis.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(record.visitDate), "MMM d, yyyy")} •{" "}
                        <span className="font-mono">{record.diagnosis.icd10Code}</span>
                      </p>
                    </div>
                    <Badge variant={record.status === "final" ? "success" : "default"} size="sm">
                      {record.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getClinicalRecord } from "@/services/recordService";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Clinical Record" };

interface Props { params: Promise<{ tenant: string; recordId: string }> }

export default async function ClinicalRecordPage({ params }: Props) {
  const { tenant, recordId } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  let record;
  try {
    record = await getClinicalRecord(recordId, payload.userId, payload.role, tenantId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href={`/${tenant}/doctor/dashboard`}>
          <Button variant="ghost" size="sm">← Dashboard</Button>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Clinical Record</h1>
        <Badge variant={record.status === "final" ? "success" : "default"}>{record.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Visit Information</CardTitle>
            <span className="text-sm text-gray-500">{format(new Date(record.visitDate), "MMMM d, yyyy")}</span>
          </div>
        </CardHeader>
        <p className="text-gray-700"><span className="font-medium">Chief Complaint: </span>{record.chiefComplaint}</p>
      </Card>

      {record.vitals && Object.keys(record.vitals).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Vital Signs</CardTitle></CardHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {record.vitals.temperature && <VitalItem label="Temperature" value={`${record.vitals.temperature}°C`} />}
            {(record.vitals.bloodPressureSystolic || record.vitals.bloodPressureDiastolic) && (
              <VitalItem label="Blood Pressure"
                value={`${record.vitals.bloodPressureSystolic || "-"}/${record.vitals.bloodPressureDiastolic || "-"} mmHg`} />
            )}
            {record.vitals.heartRate && <VitalItem label="Heart Rate" value={`${record.vitals.heartRate} bpm`} />}
            {record.vitals.oxygenSaturation && (
              <VitalItem label="SpO₂" value={`${record.vitals.oxygenSaturation}%`} alert={record.vitals.oxygenSaturation < 95} />
            )}
            {record.vitals.weight && <VitalItem label="Weight" value={`${record.vitals.weight} kg`} />}
            {record.vitals.respiratoryRate && <VitalItem label="Respiratory Rate" value={`${record.vitals.respiratoryRate}/min`} />}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Diagnosis</CardTitle></CardHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <p className="font-semibold text-gray-900 text-lg">{record.diagnosis.name}</p>
            <span className="font-mono text-sm bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{record.diagnosis.icd10Code}</span>
          </div>
          {record.diagnosis.notes && <p className="text-sm text-gray-600">{record.diagnosis.notes}</p>}
        </div>
      </Card>

      {record.prescriptions?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Prescriptions</CardTitle></CardHeader>
          <div className="space-y-4">
            {record.prescriptions.map((rx, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                <p className="font-semibold text-gray-900">{rx.medication}</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm text-gray-600">
                  <span><span className="text-xs text-gray-400 block">Dosage</span>{rx.dosage}</span>
                  <span><span className="text-xs text-gray-400 block">Frequency</span>{rx.frequency}</span>
                  <span><span className="text-xs text-gray-400 block">Duration</span>{rx.duration}</span>
                </div>
                {rx.notes && <p className="mt-2 text-xs text-gray-500">{rx.notes}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {record.notes && (
        <Card>
          <CardHeader><CardTitle>Clinical Notes</CardTitle></CardHeader>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</p>
        </Card>
      )}

      {record.followUpDate && (
        <Card className="border-blue-200 bg-blue-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <p className="font-medium text-blue-900">Follow-up Appointment</p>
              <p className="text-blue-700">{format(new Date(record.followUpDate), "MMMM d, yyyy")}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function VitalItem({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${alert ? "bg-red-50 border border-red-200" : "bg-gray-50"}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`font-semibold mt-0.5 ${alert ? "text-red-700" : "text-gray-900"}`}>
        {value}{alert && " ⚠️"}
      </p>
    </div>
  );
}

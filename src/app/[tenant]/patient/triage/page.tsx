"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SymptomChat } from "@/components/patient/SymptomChat";
import { ReportCard } from "@/components/patient/ReportCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { ITriageSession } from "@/types";

export default function TriagePage() {
  const { tenant } = useParams<{ tenant: string }>();
  const [completedSession, setCompletedSession] = useState<ITriageSession | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      {!completedSession ? (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Symptom Assessment</h1>
            <p className="mt-1 text-gray-500">
              Answer a few questions about how you&apos;re feeling. This information will be reviewed by your doctor.
            </p>
          </div>
          <Alert variant="info">
            <strong>Before you begin:</strong> This assessment does not replace a doctor&apos;s consultation.
            If you are experiencing a medical emergency, call <strong>911</strong> immediately.
          </Alert>
          <Card padding="md" className="min-h-[600px] flex flex-col">
            <SymptomChat onComplete={setCompletedSession} />
          </Card>
        </>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Assessment Complete</h1>
            <p className="mt-1 text-gray-500">Your report has been submitted for doctor review.</p>
          </div>
          <Alert variant="success" title="Assessment Submitted">
            Your symptom assessment is complete. A doctor will review your report and you will be notified of the findings.
          </Alert>
          <ReportCard session={completedSession} role="patient" />
          <div className="flex gap-3 flex-wrap">
            <Link href={`/${tenant}/patient/dashboard`}>
              <Button variant="outline">← Back to Dashboard</Button>
            </Link>
            <Link href={`/${tenant}/patient/reports`}>
              <Button variant="secondary">View All Reports</Button>
            </Link>
            <Button onClick={() => setCompletedSession(null)}>Start New Assessment</Button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SymptomChat } from "@/components/patient/SymptomChat";
import { ReportCard } from "@/components/patient/ReportCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { RiskBadge } from "@/components/ui/Badge";
import type { ITriageSession, RiskLevel } from "@/types";

// ─── Risk level visual config ─────────────────────────────────────
const RISK_META: Record<
  RiskLevel,
  { label: string; bar: string; bg: string; text: string }
> = {
  low:      { label: "Low Risk",      bar: "bg-green-500",  bg: "bg-green-50",  text: "text-green-800" },
  medium:   { label: "Medium Risk",   bar: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-800" },
  high:     { label: "High Risk",     bar: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-800" },
  critical: { label: "Critical Risk", bar: "bg-red-600",    bg: "bg-red-50",    text: "text-red-800" },
};

const RISK_WIDTH: Record<RiskLevel, string> = {
  low:      "w-1/4",
  medium:   "w-2/4",
  high:     "w-3/4",
  critical: "w-full",
};

function RiskMeter({ level, score }: { level: RiskLevel; score: number }) {
  const meta = RISK_META[level];
  return (
    <div className={`rounded-xl border p-4 ${meta.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-semibold ${meta.text}`}>{meta.label}</span>
        <span className={`text-xs font-mono font-bold ${meta.text}`}>
          {score}/100
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/60">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${meta.bar} ${RISK_WIDTH[level]}`}
        />
      </div>
      <p className={`mt-2 text-xs ${meta.text}`}>
        AI-generated risk score — must be validated by a licensed physician.
      </p>
    </div>
  );
}

export default function TriagePage() {
  const { tenant } = useParams<{ tenant: string }>();
  const [completedSession, setCompletedSession] = useState<ITriageSession | null>(null);

  const qaCount = completedSession?.qaFlow.filter((q) => q.answer && q.answer.trim()).length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {!completedSession ? (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Symptom Assessment</h1>
            <p className="mt-1 text-gray-500">
              Answer a few questions about how you&apos;re feeling. This information
              will be reviewed by your doctor.
            </p>
          </div>

          {/* Pre-assessment disclaimer */}
          <Alert variant="info">
            <p>
              <strong>Before you begin:</strong> If you are experiencing a medical
              emergency, call <strong>911</strong> immediately.
            </p>
          </Alert>

          {/* How it works — 3-step AI pipeline overview */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Answer Questions",
                desc: "Our AI asks adaptive follow-up questions based on your symptoms.",
                color: "bg-blue-50 border-blue-200 text-blue-700",
              },
              {
                step: "2",
                title: "Risk Detection",
                desc: "The system scores your responses and detects risk level in real time.",
                color: "bg-violet-50 border-violet-200 text-violet-700",
              },
              {
                step: "3",
                title: "Structured Report",
                desc: "A full AI-generated report is sent to your doctor for validation.",
                color: "bg-green-50 border-green-200 text-green-700",
              },
            ].map(({ step, title, desc, color }) => (
              <div key={step} className={`rounded-xl border p-4 ${color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
                    {step}
                  </span>
                  <span className="text-sm font-semibold">{title}</span>
                </div>
                <p className="text-xs opacity-80">{desc}</p>
              </div>
            ))}
          </div>

          <Card padding="md" className="min-h-[600px] flex flex-col">
            <SymptomChat onComplete={setCompletedSession} tenantSlug={tenant} />
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assessment Complete</h1>
              <p className="mt-1 text-gray-500">
                Your report has been submitted for doctor review.
              </p>
            </div>
            <RiskBadge level={completedSession.riskLevel} />
          </div>

          {/* Submission confirmation */}
          <Alert variant="success" title="Assessment Submitted">
            Your symptom assessment is complete. A doctor will review your AI-generated
            report and you will be notified of the findings.
          </Alert>

          {/* AI pipeline summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Questions Answered", value: qaCount },
              {
                label: "Risk Score",
                value: `${completedSession.riskScore ?? 0}/100`,
              },
              {
                label: "Risk Level",
                value:
                  completedSession.riskLevel.charAt(0).toUpperCase() +
                  completedSession.riskLevel.slice(1),
              },
              {
                label: "Status",
                value:
                  completedSession.status === "pending_review"
                    ? "Pending Review"
                    : completedSession.status === "reviewed"
                    ? "Reviewed"
                    : "Submitted",
              },
            ].map(({ label, value }) => (
              <Card key={label} padding="sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
              </Card>
            ))}
          </div>

          {/* Risk meter */}
          <RiskMeter
            level={completedSession.riskLevel}
            score={completedSession.riskScore ?? 0}
          />

          {/* Full AI report */}
          <ReportCard session={completedSession} />

          <div className="flex gap-3 flex-wrap">
            <Link href={`/${tenant}/patient/dashboard`}>
              <Button variant="outline">← Back to Dashboard</Button>
            </Link>
            <Link href={`/${tenant}/patient/reports`}>
              <Button variant="secondary">View All Reports</Button>
            </Link>
            <Button onClick={() => setCompletedSession(null)}>
              Start New Assessment
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

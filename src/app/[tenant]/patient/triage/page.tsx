"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SymptomChat } from "@/components/patient/SymptomChat";
import { ReportCard } from "@/components/patient/ReportCard";
import { ReportActions } from "@/components/patient/ReportActions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { ITriageSession, RiskLevel } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Risk meter — uses the actual numeric score for bar width
// ─────────────────────────────────────────────────────────────────
const RISK_META: Record<RiskLevel, { label: string; bar: string; bg: string; text: string; border: string }> = {
  low:      { label: "Low Risk",      bar: "bg-green-500",  bg: "bg-green-50",  text: "text-green-800",  border: "border-green-200"  },
  medium:   { label: "Medium Risk",   bar: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-200" },
  high:     { label: "High Risk",     bar: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200" },
  critical: { label: "Critical Risk", bar: "bg-red-600",    bg: "bg-red-50",    text: "text-red-800",    border: "border-red-200"    },
};

function RiskMeter({ level, score }: { level: RiskLevel; score: number }) {
  const meta = RISK_META[level];
  return (
    <div className={`rounded-xl border p-5 ${meta.bg} ${meta.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`text-sm font-bold ${meta.text}`}>{meta.label}</p>
          <p className={`text-xs mt-0.5 ${meta.text} opacity-70`}>
            AI-generated — must be validated by a licensed physician
          </p>
        </div>
        <div className={`text-3xl font-black tabular-nums ${meta.text}`}>
          {score}<span className="text-base font-medium opacity-60">/100</span>
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-white/60">
        <div
          className={`h-3 rounded-full transition-all duration-1000 ease-out ${meta.bar}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// "How it works" pipeline steps — shown before the assessment
// ─────────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Describe Symptoms",
    desc: "Tell the AI what's bothering you. It will ask adaptive follow-up questions.",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    icon: "💬",
  },
  {
    step: "2",
    title: "Risk Detection",
    desc: "Your responses are scored in real time to assess urgency and safety flags.",
    color: "bg-violet-50 border-violet-200 text-violet-700",
    icon: "🔍",
  },
  {
    step: "3",
    title: "Structured Report",
    desc: "A clinical summary is generated and sent to your doctor for review.",
    color: "bg-green-50 border-green-200 text-green-700",
    icon: "📋",
  },
];

// ─────────────────────────────────────────────────────────────────
// Completion stat card
// ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card padding="sm" className="text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1.5 text-2xl font-black text-gray-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────
export default function TriagePage() {
  const { tenant } = useParams<{ tenant: string }>();
  const [completedSession, setCompletedSession] = useState<ITriageSession | null>(null);

  const qaCount = completedSession?.qaFlow?.filter((q) => q.answer?.trim()).length ?? 0;

  // ── Assessment in progress ────────────────────────────────────
  if (!completedSession) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Symptom Assessment</h1>
          <p className="mt-1 text-gray-500">
            Answer a few questions so your doctor is better prepared for your visit.
          </p>
        </div>

        <Alert variant="warning" title="Emergency notice">
          If you are experiencing a medical emergency, call <strong>911</strong> or visit
          your nearest emergency room immediately. Do not use this tool.
        </Alert>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ step, title, desc, color, icon }) => (
            <div key={step} className={`rounded-xl border p-4 ${color}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-base">
                  {icon}
                </span>
                <span className="text-sm font-semibold">{title}</span>
              </div>
              <p className="text-xs leading-relaxed opacity-80">{desc}</p>
            </div>
          ))}
        </div>

        <Card padding="md" className="flex flex-col" style={{ minHeight: 600 }}>
          <SymptomChat onComplete={setCompletedSession} tenantSlug={tenant} />
        </Card>
      </div>
    );
  }

  // ── Assessment complete ───────────────────────────────────────
  const meta = RISK_META[completedSession.riskLevel];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-green-600 mb-1">
            Assessment Complete
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Your Report is Ready</h1>
          <p className="mt-1 text-gray-500">
            A clinician will review your AI-generated report and follow up with you.
          </p>
        </div>
        <div className={`self-start rounded-xl border px-4 py-2 text-sm font-bold ${meta.bg} ${meta.border} ${meta.text}`}>
          {meta.label}
        </div>
      </div>

      {/* Confirmation banner */}
      <Alert variant="success" title="Report submitted for review">
        Your symptom assessment has been completed and queued for clinician review.
        You will be notified when a doctor has validated the findings.
      </Alert>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Questions"
          value={qaCount || "—"}
          sub="answered"
        />
        <StatCard
          label="Risk Score"
          value={`${completedSession.riskScore ?? 0}`}
          sub="out of 100"
        />
        <StatCard
          label="Risk Level"
          value={completedSession.riskLevel.charAt(0).toUpperCase() + completedSession.riskLevel.slice(1)}
        />
        <StatCard
          label="Status"
          value={
            completedSession.status === "pending_review" ? "Pending" :
            completedSession.status === "reviewed"        ? "Reviewed" : "Submitted"
          }
          sub={completedSession.status === "pending_review" ? "awaiting review" : undefined}
        />
      </div>

      {/* Risk meter — uses actual score for bar width */}
      <RiskMeter level={completedSession.riskLevel} score={completedSession.riskScore ?? 0} />

      {/* Full report */}
      <div id="report-print-area">
        <ReportCard session={completedSession} />
      </div>

      {/* Download / Email */}
      <ReportActions session={completedSession} />

      {/* Navigation */}
      <div className="flex flex-wrap gap-3 print:hidden">
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

    </div>
  );
}

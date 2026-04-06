import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import type { ITriageSession } from "@/types";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// ReportCard — Patient-facing triage report summary
// CRITICAL: Patients see recommendations only, NOT raw condition names
// ─────────────────────────────────────────────────────────────────

interface ReportCardProps {
  session: ITriageSession;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high:     "High likelihood",
  moderate: "Moderate likelihood",
  low:      "Low likelihood",
};

const CONFIDENCE_WIDTH: Record<string, number> = {
  high: 85, moderate: 55, low: 25,
};

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-sm">
      {children}
    </span>
  );
}

export function ReportCard({ session }: ReportCardProps) {
  const { aiReport, clinicalReview, safetyFlags, status } = session;

  const hasEmergencyFlags = safetyFlags?.some((f) => f.severity === "emergency");
  const isReviewed        = status === "reviewed";
  const isPending         = status === "pending_review";

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header card ───────────────────────────────────────── */}
      <Card className="bg-gradient-to-br from-white to-blue-50/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-1">
              Pre-Consultation Summary
            </p>
            <h2 className="text-xl font-bold text-gray-900">Your AI Assessment Report</h2>
            <p className="mt-1 text-sm text-gray-500">
              {session.createdAt
                ? format(new Date(session.createdAt), "PPP 'at' p")
                : "Just now"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={session.riskLevel} score={session.riskScore} />
            <Badge variant={isReviewed ? "success" : isPending ? "info" : "default"}>
              {isReviewed ? "✓ Clinician Reviewed" : isPending ? "Pending Review" : "In Progress"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* ── Emergency banner ──────────────────────────────────── */}
      {hasEmergencyFlags && (
        <Alert variant="emergency" title="Urgent Safety Notice">
          Your assessment flagged symptoms that may require prompt medical
          attention. Please seek emergency care if symptoms worsen.
        </Alert>
      )}

      {/* ── Assessment summary ────────────────────────────────── */}
      {aiReport?.summary ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>📋</SectionIcon>
              <CardTitle>Assessment Summary</CardTitle>
            </div>
          </CardHeader>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Main Concern</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {aiReport.summary.chiefComplaint || session.chiefComplaint}
              </dd>
            </div>
            {aiReport.summary.duration && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Duration</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">{aiReport.summary.duration}</dd>
              </div>
            )}
            {aiReport.summary.severity && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Severity</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">{aiReport.summary.severity}</dd>
              </div>
            )}
            {aiReport.summary.onset && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Onset</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">{aiReport.summary.onset}</dd>
              </div>
            )}
          </dl>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>📋</SectionIcon>
              <CardTitle>Main Concern</CardTitle>
            </div>
          </CardHeader>
          <p className="text-gray-700">{session.chiefComplaint}</p>
        </Card>
      )}

      {/* ── Attention points (safety flags) ───────────────────── */}
      {safetyFlags && safetyFlags.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>⚑</SectionIcon>
              <CardTitle>Attention Points</CardTitle>
            </div>
          </CardHeader>
          <ul className="space-y-2">
            {safetyFlags.map((flag, idx) => (
              <li key={`${flag.flag}-${idx}`} className="flex items-start gap-3 rounded-lg p-2.5 bg-gray-50">
                <span
                  className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                    flag.severity === "emergency" ? "bg-red-500" :
                    flag.severity === "urgent"    ? "bg-orange-500" : "bg-yellow-400"
                  }`}
                />
                <span className="text-sm text-gray-700 leading-snug">{flag.flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Areas of concern (possible conditions) ────────────── */}
      {aiReport?.possibleConditions && aiReport.possibleConditions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>🔍</SectionIcon>
              <CardTitle>Areas of Concern</CardTitle>
            </div>
          </CardHeader>
          <p className="mb-4 text-xs text-gray-500 leading-relaxed">
            These are possible areas your clinician will evaluate — not a diagnosis.
          </p>
          <ul className="space-y-4">
            {aiReport.possibleConditions.map((cond, idx) => {
              const pct = CONFIDENCE_WIDTH[cond.likelihood] ?? Math.round(cond.confidence * 100);
              return (
                <li key={`${cond.name}-${idx}`} className="space-y-1.5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-semibold text-gray-800 min-w-0 break-words">{cond.name}</span>
                    <span className={`self-start sm:self-auto flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      cond.likelihood === "high"     ? "bg-red-100 text-red-700" :
                      cond.likelihood === "moderate" ? "bg-orange-100 text-orange-700" :
                                                       "bg-blue-100 text-blue-700"
                    }`}>
                      {CONFIDENCE_LABEL[cond.likelihood] ?? cond.likelihood}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-2 rounded-full transition-all duration-700 ${
                        cond.likelihood === "high"     ? "bg-red-500" :
                        cond.likelihood === "moderate" ? "bg-orange-400" : "bg-blue-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {cond.description && (
                    <p className="text-xs text-gray-500 leading-relaxed">{cond.description}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── Recommendations ───────────────────────────────────── */}
      {aiReport?.recommendations && aiReport.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>✓</SectionIcon>
              <CardTitle>Recommendations</CardTitle>
            </div>
          </CardHeader>
          <ul className="space-y-2.5">
            {aiReport.recommendations.map((rec, idx) => (
              <li key={`rec-${idx}`} className="flex items-start gap-3 rounded-lg bg-blue-50/60 p-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                  {idx + 1}
                </span>
                <span className="text-sm text-gray-700 leading-relaxed">{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Red flags ─────────────────────────────────────────── */}
      {aiReport?.redFlags && aiReport.redFlags.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>🚩</SectionIcon>
              <CardTitle className="text-red-700">Red Flags — Seek Care Promptly</CardTitle>
            </div>
          </CardHeader>
          <p className="mb-3 text-xs text-red-600">
            If any of the following worsen or appear, seek immediate medical attention.
          </p>
          <ul className="space-y-2">
            {aiReport.redFlags.map((flag, idx) => (
              <li key={`rf-${idx}`} className="flex items-start gap-3 rounded-lg bg-red-50 p-3">
                <span className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500" />
                <span className="text-sm text-red-800 leading-snug">{flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Follow-up timeframe ───────────────────────────────── */}
      {aiReport?.followUpTimeframe && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <span className="text-xl leading-none">🗓</span>
          <div>
            <p className="text-sm font-semibold text-blue-800">Recommended Follow-up</p>
            <p className="mt-0.5 text-sm text-blue-700">{aiReport.followUpTimeframe}</p>
          </div>
        </div>
      )}

      {/* ── Clinician review ──────────────────────────────────── */}
      {clinicalReview && (
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionIcon>👨‍⚕️</SectionIcon>
              <CardTitle className="text-green-800">Clinician Review</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-white/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reviewed by</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {clinicalReview.reviewedBy}
                {clinicalReview.reviewedAt
                  ? <span className="ml-2 text-gray-400 font-normal">
                      • {format(new Date(clinicalReview.reviewedAt), "PPp")}
                    </span>
                  : null}
              </p>
            </div>
            {clinicalReview.notes && (
              <div className="rounded-lg bg-white/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 text-sm text-gray-700 leading-relaxed">{clinicalReview.notes}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Disclaimer ────────────────────────────────────────── */}
      <Alert variant="info" title="Important Notice">
        {aiReport?.disclaimer
          ? aiReport.disclaimer
          : <>
              This summary was generated by an AI assistant to help your clinician
              understand your symptoms. It is <strong>not a medical diagnosis</strong>.
              Please consult a healthcare professional for proper evaluation and advice.
            </>
        }
      </Alert>

    </div>
  );
}

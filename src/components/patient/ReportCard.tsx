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

export function ReportCard({ session }: ReportCardProps) {
  const { aiReport, clinicalReview, safetyFlags, status } = session;

  const hasEmergencyFlags = safetyFlags?.some((f) => f.severity === "emergency");
  const isReviewed        = status === "reviewed";
  const isPending         = status === "pending_review";

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Your Pre-Consultation Summary</h2>
            <p className="mt-1 text-sm text-gray-500">
              {format(new Date(session.createdAt), "PPP 'at' p")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RiskBadge level={session.riskLevel} />
            <Badge variant={isReviewed ? "success" : isPending ? "info" : "default"}>
              {isReviewed ? "Clinician Reviewed" : isPending ? "Pending Review" : "In Progress"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Emergency flags */}
      {hasEmergencyFlags && (
        <Alert variant="emergency" title="Urgent Safety Notice">
          Your assessment flagged symptoms that may require prompt medical
          attention. Please seek emergency care if symptoms worsen.
        </Alert>
      )}

      {/* AI Summary — structured */}
      {aiReport?.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Assessment Summary</CardTitle>
          </CardHeader>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Main Concern</dt>
              <dd className="mt-1 text-sm text-gray-900">{aiReport.summary.chiefComplaint || session.chiefComplaint}</dd>
            </div>
            {aiReport.summary.duration && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Duration</dt>
                <dd className="mt-1 text-sm text-gray-900">{aiReport.summary.duration}</dd>
              </div>
            )}
            {aiReport.summary.severity && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Severity</dt>
                <dd className="mt-1 text-sm text-gray-900">{aiReport.summary.severity}</dd>
              </div>
            )}
            {aiReport.summary.onset && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Onset</dt>
                <dd className="mt-1 text-sm text-gray-900">{aiReport.summary.onset}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Fallback when AI report not yet generated */}
      {!aiReport && (
        <Card>
          <CardHeader>
            <CardTitle>Main Concern</CardTitle>
          </CardHeader>
          <p className="text-gray-700">{session.chiefComplaint}</p>
        </Card>
      )}

      {/* Safety flags */}
      {safetyFlags?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attention Points</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {safetyFlags.map((flag, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                    flag.severity === "emergency"
                      ? "bg-red-500"
                      : flag.severity === "urgent"
                      ? "bg-orange-500"
                      : "bg-yellow-500"
                  }`}
                />
                <span className="text-sm text-gray-700">{flag.flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Possible conditions — shown as a confidence bar, not raw diagnosis labels */}
      {aiReport?.possibleConditions && aiReport.possibleConditions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Areas of Concern</CardTitle>
          </CardHeader>
          <p className="mb-3 text-xs text-gray-500">
            These are possible areas your clinician will evaluate — not a diagnosis.
          </p>
          <ul className="space-y-3">
            {aiReport.possibleConditions.map((cond, idx) => (
              <li key={idx} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{cond.name}</span>
                  <span className="text-xs text-gray-500">
                    {CONFIDENCE_LABEL[cond.likelihood] ?? cond.likelihood}
                  </span>
                </div>
                {/* Confidence bar */}
                <div className="h-1.5 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      cond.likelihood === "high"
                        ? "bg-red-500"
                        : cond.likelihood === "moderate"
                        ? "bg-orange-400"
                        : "bg-blue-400"
                    }`}
                    style={{ width: `${Math.round(cond.confidence * 100)}%` }}
                  />
                </div>
                {cond.description && (
                  <p className="text-xs text-gray-500">{cond.description}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recommendations */}
      {aiReport?.recommendations && aiReport.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {aiReport.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-blue-500">→</span>
                <span className="text-sm text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Clinician review */}
      {clinicalReview && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">Clinician Review</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reviewed by</p>
              <p className="text-gray-900">
                {clinicalReview.reviewedBy} •{" "}
                {format(new Date(clinicalReview.reviewedAt), "PPp")}
              </p>
            </div>
            {clinicalReview.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</p>
                <p className="text-sm text-gray-700">{clinicalReview.notes}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Disclaimer */}
      {aiReport?.disclaimer ? (
        <Alert variant="info" title="Important Notice">
          {aiReport.disclaimer}
        </Alert>
      ) : (
        <Alert variant="info" title="Important Notice">
          This summary was generated by an AI assistant to help your clinician
          understand your symptoms. It is <strong>not a medical diagnosis</strong>.
          Please consult a healthcare professional for proper evaluation and advice.
        </Alert>
      )}
    </div>
  );
}

import { RiskBadge, Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import type { ITriageSession } from "@/types";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// ReportCard — Patient-facing triage report summary
// CRITICAL: Patients see recommendations only, NOT condition names
// ─────────────────────────────────────────────────────────────────

interface ReportCardProps {
  session: ITriageSession;
  role?: "patient" | "doctor" | "admin";
}

export function ReportCard({ session, role = "patient" }: ReportCardProps) {
  const isDoctor = role === "doctor" || role === "admin";
  const hasEmergencyFlags = session.safetyFlags?.some(
    (f) => f.severity === "emergency"
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isDoctor ? "Triage Report" : "Your Pre-Consultation Summary"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {format(new Date(session.createdAt), "PPP 'at' p")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RiskBadge level={session.riskLevel} score={isDoctor ? session.riskScore : undefined} />
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
                ? "Doctor Reviewed"
                : session.status === "completed"
                ? "Pending Review"
                : "In Progress"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Emergency flags */}
      {hasEmergencyFlags && (
        <Alert variant="emergency" title="Urgent Safety Notice">
          Your assessment flagged symptoms that may require prompt medical
          attention. Please contact your doctor or seek emergency care if
          symptoms worsen.
        </Alert>
      )}

      {/* Chief complaint */}
      <Card>
        <CardHeader>
          <CardTitle>Main Concern</CardTitle>
        </CardHeader>
        <p className="text-gray-700">{session.chiefComplaint}</p>
      </Card>

      {/* Safety flags (patient-friendly) */}
      {session.safetyFlags?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attention Points</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {session.safetyFlags.map((flag, idx) => (
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

      {/* Recommendations (shown to all) */}
      {session.recommendations?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {session.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-blue-500">→</span>
                <span className="text-sm text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Doctor-only section: Possible conditions and AI summary */}
      {isDoctor && (
        <>
          {session.aiSummary && (
            <Card>
              <CardHeader>
                <CardTitle>AI Clinical Summary</CardTitle>
              </CardHeader>
              <p className="text-sm text-gray-700 leading-relaxed">
                {session.aiSummary}
              </p>
            </Card>
          )}

          {session.possibleConditions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>AI-Suggested Possible Conditions</CardTitle>
              </CardHeader>
              <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                These are AI-generated suggestions for clinical reference only.
                They do not constitute a diagnosis. Doctor validation is
                required.
              </p>
              <div className="space-y-3">
                {session.possibleConditions.map((condition, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between rounded-lg border border-gray-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {condition.name}
                      </p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        ICD-10: {condition.icd10Code}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {condition.description}
                      </p>
                    </div>
                    <Badge
                      variant={
                        condition.likelihood === "high"
                          ? "danger"
                          : condition.likelihood === "moderate"
                          ? "warning"
                          : "default"
                      }
                      className="ml-3 shrink-0"
                    >
                      {condition.likelihood}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Doctor validation result */}
      {session.doctorValidation && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">
              Doctor&apos;s Assessment
            </CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {isDoctor && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Final Diagnosis
                  </p>
                  <p className="font-medium text-gray-900">
                    {session.doctorValidation.finalDiagnosis}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    ICD-10 Code
                  </p>
                  <p className="font-mono text-gray-900">
                    {session.doctorValidation.icd10Code}
                  </p>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Reviewed by
              </p>
              <p className="text-gray-900">
                {session.doctorValidation.doctorName} •{" "}
                {format(new Date(session.doctorValidation.validatedAt), "PPp")}
              </p>
            </div>
            {session.doctorValidation.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Notes
                </p>
                <p className="text-sm text-gray-700">
                  {session.doctorValidation.notes}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Patient disclaimer */}
      {!isDoctor && (
        <Alert variant="info" title="Important Notice">
          This summary was generated by an AI assistant to help your doctor
          understand your symptoms better. It is{" "}
          <strong>not a medical diagnosis</strong>. Please consult your doctor
          for proper medical evaluation and advice.
        </Alert>
      )}
    </div>
  );
}

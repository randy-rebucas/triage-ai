"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { ReportCard } from "@/components/patient/ReportCard";
import type { ITriageSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// TriageReview — Doctor UI for reviewing and validating a triage
// ─────────────────────────────────────────────────────────────────

interface TriageReviewProps {
  session: ITriageSession;
  onValidated: (updatedSession: ITriageSession) => void;
}

interface ValidationForm {
  finalDiagnosis: string;
  icd10Code: string;
  notes: string;
  agreedWithAI: boolean;
}

export function TriageReview({ session, onValidated }: TriageReviewProps) {
  const [form, setForm] = useState<ValidationForm>({
    finalDiagnosis: "",
    icd10Code: "",
    notes: "",
    agreedWithAI: false,
  });
  const [errors, setErrors] = useState<Partial<ValidationForm>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isAlreadyValidated = session.status === "validated";

  const validate = (): boolean => {
    const newErrors: Partial<ValidationForm> = {};

    if (!form.finalDiagnosis.trim()) {
      newErrors.finalDiagnosis = "Final diagnosis is required";
    }
    if (!form.icd10Code.trim()) {
      newErrors.icd10Code = "ICD-10 code is required";
    } else if (!/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/.test(form.icd10Code)) {
      newErrors.icd10Code =
        "Invalid ICD-10 format (e.g., J06.9, I10, K29.70)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/triage/${session._id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");

      onValidated(data.data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* AI Report (left column) */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          AI Triage Report
        </h2>
        <ReportCard session={session} role="doctor" />
      </div>

      {/* Validation Form (right column) */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          {isAlreadyValidated ? "Validation Record" : "Doctor Validation"}
        </h2>

        {isAlreadyValidated ? (
          <Card>
            <Alert variant="success" title="Session Validated">
              This triage session has been reviewed and validated by{" "}
              <strong>{session.doctorValidation?.doctorName}</strong>.
            </Alert>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Add Your Assessment</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Review the AI report above, then provide your clinical
                assessment. Your diagnosis will be recorded in the patient&apos;s
                clinical record.
              </p>
            </CardHeader>

            {submitError && (
              <Alert variant="error" className="mb-4">
                {submitError}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Final Diagnosis"
                placeholder="e.g., Acute nasopharyngitis (common cold)"
                value={form.finalDiagnosis}
                onChange={(e) =>
                  setForm((f) => ({ ...f, finalDiagnosis: e.target.value }))
                }
                error={errors.finalDiagnosis}
                required
              />

              <Input
                label="ICD-10 Code"
                placeholder="e.g., J00, I10, K29.70"
                value={form.icd10Code}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    icd10Code: e.target.value.toUpperCase(),
                  }))
                }
                error={errors.icd10Code}
                hint="Enter the primary ICD-10 diagnosis code"
                required
              />

              <Textarea
                label="Clinical Notes"
                placeholder="Additional clinical observations, treatment plan, or follow-up instructions..."
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={4}
              />

              {/* Agreement with AI */}
              <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-4">
                <input
                  type="checkbox"
                  id="agreedWithAI"
                  checked={form.agreedWithAI}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, agreedWithAI: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <label
                  htmlFor="agreedWithAI"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  The AI&apos;s possible conditions align with my clinical assessment
                  (this is for internal quality tracking and does not affect the
                  diagnosis)
                </label>
              </div>

              <Alert variant="warning">
                By submitting, you confirm that this assessment reflects your
                independent clinical judgment as a licensed physician.
              </Alert>

              <Button
                type="submit"
                isLoading={isSubmitting}
                className="w-full"
                size="lg"
              >
                Submit Validation
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

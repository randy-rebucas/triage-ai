"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

// ─────────────────────────────────────────────────────────────────
// DiagnosisForm — Create a new clinical record from a triage session
// ─────────────────────────────────────────────────────────────────

interface PrescriptionField {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
}

interface DiagnosisFormProps {
  patientId: string;
  triageSessionId?: string;
  chiefComplaint?: string;
  onSuccess?: (recordId: string) => void;
}

export function DiagnosisForm({
  patientId,
  triageSessionId,
  chiefComplaint = "",
  onSuccess,
}: DiagnosisFormProps) {
  const [form, setForm] = useState({
    chiefComplaint,
    diagnosisName: "",
    icd10Code: "",
    diagnosisNotes: "",
    notes: "",
    followUpDate: "",
    status: "draft" as "draft" | "final",
    vitals: {
      temperature: "",
      bloodPressureSystolic: "",
      bloodPressureDiastolic: "",
      heartRate: "",
      oxygenSaturation: "",
      weight: "",
    },
  });

  const [prescriptions, setPrescriptions] = useState<PrescriptionField[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addPrescription = () => {
    setPrescriptions((prev) => [
      ...prev,
      { medication: "", dosage: "", frequency: "", duration: "", notes: "" },
    ]);
  };

  const updatePrescription = (
    idx: number,
    field: keyof PrescriptionField,
    value: string
  ) => {
    setPrescriptions((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const removePrescription = (idx: number) => {
    setPrescriptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent, finalStatus?: "final") => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const vitals: Record<string, number> = {};
    Object.entries(form.vitals).forEach(([key, val]) => {
      if (val) vitals[key] = parseFloat(val);
    });

    const payload = {
      patientId,
      triageSessionId,
      chiefComplaint: form.chiefComplaint,
      vitals: Object.keys(vitals).length ? vitals : undefined,
      diagnosis: {
        name: form.diagnosisName,
        icd10Code: form.icd10Code,
        notes: form.diagnosisNotes,
      },
      prescriptions: prescriptions.filter((p) => p.medication),
      notes: form.notes,
      followUpDate: form.followUpDate || undefined,
      status: finalStatus || form.status,
    };

    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create record");

      setSuccess(true);
      onSuccess?.(data.data._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create record");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <Alert variant="success" title="Clinical Record Created">
        The clinical record has been saved successfully.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Vitals */}
      <Card>
        <CardHeader>
          <CardTitle>Vital Signs</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Input
            label="Temperature (°C)"
            type="number"
            step="0.1"
            placeholder="36.5"
            value={form.vitals.temperature}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                vitals: { ...f.vitals, temperature: e.target.value },
              }))
            }
          />
          <Input
            label="BP Systolic"
            type="number"
            placeholder="120"
            value={form.vitals.bloodPressureSystolic}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                vitals: {
                  ...f.vitals,
                  bloodPressureSystolic: e.target.value,
                },
              }))
            }
          />
          <Input
            label="BP Diastolic"
            type="number"
            placeholder="80"
            value={form.vitals.bloodPressureDiastolic}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                vitals: {
                  ...f.vitals,
                  bloodPressureDiastolic: e.target.value,
                },
              }))
            }
          />
          <Input
            label="Heart Rate (bpm)"
            type="number"
            placeholder="72"
            value={form.vitals.heartRate}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                vitals: { ...f.vitals, heartRate: e.target.value },
              }))
            }
          />
          <Input
            label="SpO₂ (%)"
            type="number"
            placeholder="98"
            value={form.vitals.oxygenSaturation}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                vitals: { ...f.vitals, oxygenSaturation: e.target.value },
              }))
            }
          />
          <Input
            label="Weight (kg)"
            type="number"
            step="0.1"
            placeholder="70"
            value={form.vitals.weight}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                vitals: { ...f.vitals, weight: e.target.value },
              }))
            }
          />
        </div>
      </Card>

      {/* Diagnosis */}
      <Card>
        <CardHeader>
          <CardTitle>Diagnosis</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <Input
            label="Chief Complaint"
            value={form.chiefComplaint}
            onChange={(e) =>
              setForm((f) => ({ ...f, chiefComplaint: e.target.value }))
            }
            required
          />
          <Input
            label="Diagnosis"
            placeholder="e.g., Hypertensive urgency"
            value={form.diagnosisName}
            onChange={(e) =>
              setForm((f) => ({ ...f, diagnosisName: e.target.value }))
            }
            required
          />
          <Input
            label="ICD-10 Code"
            placeholder="e.g., I16.0"
            value={form.icd10Code}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                icd10Code: e.target.value.toUpperCase(),
              }))
            }
            required
          />
          <Textarea
            label="Diagnosis Notes"
            placeholder="Additional details about the diagnosis..."
            value={form.diagnosisNotes}
            onChange={(e) =>
              setForm((f) => ({ ...f, diagnosisNotes: e.target.value }))
            }
            rows={3}
          />
        </div>
      </Card>

      {/* Prescriptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Prescriptions</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPrescription}
            >
              + Add Medication
            </Button>
          </div>
        </CardHeader>
        {prescriptions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No prescriptions added yet
          </p>
        ) : (
          <div className="space-y-4">
            {prescriptions.map((p, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-gray-200 p-4 relative"
              >
                <button
                  type="button"
                  onClick={() => removePrescription(idx)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-red-500 transition-colors"
                >
                  ✕
                </button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Medication"
                    placeholder="Drug name"
                    value={p.medication}
                    onChange={(e) =>
                      updatePrescription(idx, "medication", e.target.value)
                    }
                  />
                  <Input
                    label="Dosage"
                    placeholder="e.g., 500mg"
                    value={p.dosage}
                    onChange={(e) =>
                      updatePrescription(idx, "dosage", e.target.value)
                    }
                  />
                  <Input
                    label="Frequency"
                    placeholder="e.g., Twice daily"
                    value={p.frequency}
                    onChange={(e) =>
                      updatePrescription(idx, "frequency", e.target.value)
                    }
                  />
                  <Input
                    label="Duration"
                    placeholder="e.g., 7 days"
                    value={p.duration}
                    onChange={(e) =>
                      updatePrescription(idx, "duration", e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Notes & Follow-up */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Notes</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <Textarea
            label="Clinical Notes"
            placeholder="Treatment plan, patient education, special instructions..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={4}
          />
          <Input
            label="Follow-up Date"
            type="date"
            value={form.followUpDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, followUpDate: e.target.value }))
            }
          />
        </div>
      </Card>

      {/* Actions */}
      <CardFooter className="border-0 pt-0">
        <div className="flex gap-3">
          <Button
            type="submit"
            variant="secondary"
            isLoading={isSubmitting}
          >
            Save as Draft
          </Button>
          <Button
            type="button"
            isLoading={isSubmitting}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, "final")}
          >
            Finalize Record
          </Button>
        </div>
      </CardFooter>
    </form>
  );
}

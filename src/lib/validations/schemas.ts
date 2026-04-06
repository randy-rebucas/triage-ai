import { z } from "zod";

// ─────────────────────────────────────────────────────────────────
// Zod Validation Schemas — used across API routes
// ─────────────────────────────────────────────────────────────────

// ─── Triage ──────────────────────────────────────────────────────

export const triageStartSchema = z.object({
  chiefComplaint: z
    .string({ required_error: "Please describe your main symptom or concern" })
    .min(10, "Please provide more detail about your symptoms (min 10 characters)")
    .max(1000, "Description cannot exceed 1000 characters"),
});

export const triageAnswerSchema = z.object({
  answer: z
    .string({ required_error: "Answer is required" })
    .min(1, "Please provide an answer")
    .max(500, "Answer cannot exceed 500 characters"),
  questionId: z.string().optional(),
});

export type TriageStartInput  = z.infer<typeof triageStartSchema>;
export type TriageAnswerInput = z.infer<typeof triageAnswerSchema>;

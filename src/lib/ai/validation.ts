import { z } from "zod";

// ─────────────────────────────────────────────────────────────────
// AI Output Validation — Zod schemas for all four pipeline stages.
//
// Every AI call goes through parseAndValidate() which:
//   1. Strips markdown code fences the model sometimes wraps around JSON
//   2. Parses the JSON
//   3. Validates the shape with the matching Zod schema
//   4. Applies .default() coercions for optional/nullable fields
//
// Throwing a structured error here is intentional — it surfaces
// prompt or model regressions early rather than letting bad data
// propagate into MongoDB or the UI.
// ─────────────────────────────────────────────────────────────────

// ─── Stage 0 — Symptom Extraction ────────────────────────────────

export const ExtractedSymptomSchema = z.object({
  symptom:  z.string().min(1),
  location: z.string().nullish().transform((v) => v ?? null),
  severity: z.string().nullish().transform((v) => v ?? null),
  duration: z.string().nullish().transform((v) => v ?? null),
});

export const SymptomExtractionResultSchema = z.object({
  symptoms:          z.array(ExtractedSymptomSchema).default([]),
  primarySymptom:    z.string().min(1),
  duration:          z.string().nullish().transform((v) => v ?? null),
  severity:          z.string().nullish().transform((v) => v ?? null),
  onset:             z.string().nullish().transform((v) => v ?? null),
  bodySystem:        z.string().default("general"),
  redFlagLanguage:   z.array(z.string()).default([]),
  coveredDimensions: z.array(z.string()).default([]),
  missingDimensions: z.array(z.string()).default([]),
});

// ─── Stage 1 — Adaptive Questioning ──────────────────────────────

export const NextQuestionResultSchema = z.object({
  questionId:     z.string().min(1),
  question:       z.string().min(1),
  inputType:      z.enum(["text", "yes_no", "slider"]).default("text"),
  category:       z.string().default("history"),
  isLastQuestion: z.boolean().default(false),
  progress:       z.number().min(0).max(100).default(0),
});

// ─── Stage 2 — Risk Scoring ───────────────────────────────────────

export const SafetyFlagSchema = z.object({
  flag:     z.string().min(1),
  severity: z.enum(["warning", "urgent", "emergency"]),
});

export const RiskScoringResultSchema = z.object({
  riskScore:                 z.number().min(0).max(100),
  riskLevel:                 z.enum(["low", "medium", "high", "critical"]),
  safetyFlags:               z.array(SafetyFlagSchema).default([]),
  requiresEmergencyReferral: z.boolean().default(false),
  reasoning:                 z.string().default(""),
  recommendedTimeframe:      z.string().default(""),
});

// ─── Stage 3 — Report Generation ─────────────────────────────────

export const PossibleConditionSchema = z.object({
  name:        z.string().min(1),
  icd10Code:   z.string().min(1),
  confidence:  z.number().min(0).max(1),
  likelihood:  z.enum(["low", "moderate", "high"]),
  description: z.string().min(1),
});

export const ReportSummarySchema = z.object({
  chiefComplaint: z.string().min(1),
  duration:       z.string().default("unknown"),
  severity:       z.string().default("unknown"),
  onset:          z.string().default("unknown"),
});

export const ReportResultSchema = z.object({
  summary:            ReportSummarySchema,
  possibleConditions: z.array(PossibleConditionSchema).min(1).max(5),
  recommendations:    z.array(z.string().min(1)).min(1),
  redFlags:           z.array(z.string()).default([]),
  urgency:            z.enum(["low", "medium", "high", "critical"]),
  followUpTimeframe:  z.string().min(1),
  disclaimer:         z.string().min(1),
});

// ─── Inferred TypeScript types ────────────────────────────────────

export type ValidatedSymptomExtractionResult = z.infer<typeof SymptomExtractionResultSchema>;
export type ValidatedNextQuestionResult      = z.infer<typeof NextQuestionResultSchema>;
export type ValidatedRiskScoringResult       = z.infer<typeof RiskScoringResultSchema>;
export type ValidatedReportResult            = z.infer<typeof ReportResultSchema>;

// ─── Core helper ──────────────────────────────────────────────────

/**
 * Strip markdown code fences, JSON-parse, then Zod-validate the AI response.
 *
 * Throws a descriptive error that includes the stage name and the first
 * Zod issue, making prompt regressions easy to diagnose in server logs.
 */
export function parseAndValidate<T>(
  schema: z.ZodType<T>,
  rawContent: string,
  stageName: string,
): T {
  const cleaned = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/,          "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `[AI:${stageName}] Response is not valid JSON. First 80 chars: ${cleaned.slice(0, 80)}[TRUNCATED]`,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")||"root"}: ${i.message}`)
      .join(" | ");
    throw new Error(`[AI:${stageName}] Schema validation failed — ${issues}`);
  }

  return result.data;
}

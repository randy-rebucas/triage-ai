// ─────────────────────────────────────────────────────────────────
// AI Prompt System — Barrel Export
//
// Four-stage medical triage pipeline:
//
//   Stage 0 — Symptom Extraction
//     extractSymptoms(context) → SymptomExtractionResult
//     Parses the chief complaint into structured symptom data and
//     identifies which clinical dimensions still need follow-up.
//
//   Stage 1 — Adaptive Questioning
//     generateNextQuestion(context) → NextQuestionResult
//     Generates the next empathetic clarifying question, choosing
//     the most important uncovered dimension. Returns inputType so
//     the UI renders the correct control (text / yes_no / slider).
//
//   Stage 2 — Risk Scoring
//     calculateRiskScore(context) → RiskScoringResult
//     Assigns a 0–100 risk score with safety flags, clinical
//     reasoning, and a recommended timeframe to be seen.
//
//   Stage 3 — Report Generation
//     generateTriageReport(context) → ReportResult
//     Produces the full structured pre-consultation report with
//     possible conditions (ICD-10), recommendations, red flags,
//     and the mandatory medical disclaimer.
//
// All stages enforce:
//   • JSON-only outputs
//   • No medical diagnoses (hedging language throughout)
//   • Safety constraints and mandatory disclaimers
// ─────────────────────────────────────────────────────────────────

// Stage 0 — Symptom Extraction
export {
  buildSymptomExtractionSystemPrompt,
  buildSymptomExtractionUserPrompt,
  ALL_DIMENSIONS,
} from "./symptomExtraction";

export type {
  SymptomExtractionContext,
  SymptomExtractionResult,
  ExtractedSymptom,
  ClinicalDimension,
} from "./symptomExtraction";

// Stage 1 — Adaptive Questioning
export {
  buildQuestioningSystemPrompt,
  buildQuestioningUserPrompt,
} from "./questioning";

export type {
  QuestioningContext,
  NextQuestionResult,
} from "./questioning";

// Stage 2 — Risk Scoring
export {
  buildRiskScoringSystemPrompt,
  buildRiskScoringUserPrompt,
} from "./riskScoring";

export type {
  RiskScoringContext,
  RiskScoringResult,
  SafetyFlag,
} from "./riskScoring";

// Stage 3 — Report Generation
export {
  buildReportSystemPrompt,
  buildReportUserPrompt,
} from "./reportGeneration";

export type {
  ReportContext,
  ReportResult,
  ReportSummary,
  PossibleCondition,
} from "./reportGeneration";

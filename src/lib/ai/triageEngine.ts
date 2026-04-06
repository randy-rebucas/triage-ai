import openaiClient, { AI_MODEL, AI_MAX_TOKENS, AI_TEMPERATURE } from "./client";
import {
  buildSymptomExtractionSystemPrompt,
  buildSymptomExtractionUserPrompt,
  type SymptomExtractionContext,
  type SymptomExtractionResult,
} from "./prompts/symptomExtraction";
import {
  buildQuestioningSystemPrompt,
  buildQuestioningUserPrompt,
  type QuestioningContext,
  type NextQuestionResult,
} from "./prompts/questioning";
import {
  buildRiskScoringSystemPrompt,
  buildRiskScoringUserPrompt,
  type RiskScoringContext,
  type RiskScoringResult,
} from "./prompts/riskScoring";
import {
  buildReportSystemPrompt,
  buildReportUserPrompt,
  type ReportContext,
  type ReportResult,
} from "./prompts/reportGeneration";

// ─────────────────────────────────────────────────────────────────
// AI Triage Engine
//
// Four-stage pipeline:
//   Stage 0 — extractSymptoms      : structured parsing of chief complaint
//   Stage 1 — generateNextQuestion : adaptive follow-up questioning
//   Stage 2 — calculateRiskScore   : numeric risk + safety flags
//   Stage 3 — generateTriageReport : full structured pre-consultation report
// ─────────────────────────────────────────────────────────────────

// ── Shared JSON parser ────────────────────────────────────────────

/**
 * Parse JSON from an AI response, handling markdown code fences
 * that some models wrap around their JSON output.
 */
function parseAIJson<T>(content: string): T {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`AI returned invalid JSON: ${cleaned.slice(0, 300)}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Stage 0 — Symptom Extraction
// ─────────────────────────────────────────────────────────────────

/**
 * Parse the patient's free-text chief complaint into a structured
 * symptom object. Identifies covered and missing clinical dimensions
 * so the questioning stage can focus on gaps.
 *
 * Should be called once at session start, before the first question.
 */
export async function extractSymptoms(
  context: SymptomExtractionContext
): Promise<SymptomExtractionResult> {
  const response = await openaiClient.chat.completions.create({
    model:           AI_MODEL,
    temperature:     0.1, // Low temperature — extraction should be deterministic
    max_tokens:      512,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSymptomExtractionSystemPrompt() },
      { role: "user",   content: buildSymptomExtractionUserPrompt(context) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI symptom extraction module");

  const result = parseAIJson<SymptomExtractionResult>(content);

  // Guarantee required arrays are always present
  result.symptoms           = result.symptoms           ?? [];
  result.redFlagLanguage    = result.redFlagLanguage    ?? [];
  result.coveredDimensions  = result.coveredDimensions  ?? [];
  result.missingDimensions  = result.missingDimensions  ?? [];
  result.bodySystem         = result.bodySystem         ?? "general";
  result.primarySymptom     = result.primarySymptom     || context.chiefComplaint.slice(0, 60);

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Stage 1 — Adaptive Questioning
// ─────────────────────────────────────────────────────────────────

/**
 * Generate the next adaptive follow-up question.
 * Uses extraction context (when available) to prioritise uncovered
 * clinical dimensions. Returns `inputType` so the UI renders the
 * appropriate input control without relying on heuristics.
 */
export async function generateNextQuestion(
  context: QuestioningContext
): Promise<NextQuestionResult> {
  const response = await openaiClient.chat.completions.create({
    model:           AI_MODEL,
    temperature:     AI_TEMPERATURE,
    max_tokens:      256,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildQuestioningSystemPrompt() },
      { role: "user",   content: buildQuestioningUserPrompt(context) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI questioning module");

  const result = parseAIJson<NextQuestionResult>(content);

  if (!result.questionId || !result.question) {
    throw new Error("AI questioning response missing required fields (questionId, question)");
  }

  // Guarantee inputType is always a valid value
  if (!["text", "yes_no", "slider"].includes(result.inputType)) {
    result.inputType = "text";
  }

  // Force last-question flag once we hit the maximum
  if (context.answeredQuestions.length >= 7) {
    result.isLastQuestion = true;
    result.progress       = 100;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Stage 2 — Risk Scoring
// ─────────────────────────────────────────────────────────────────

/**
 * Analyse the full conversation and assign a 0–100 risk score with
 * categorical level, safety flags, clinical reasoning, and a
 * recommended timeframe for the patient to be seen.
 */
export async function calculateRiskScore(
  context: RiskScoringContext
): Promise<RiskScoringResult> {
  const response = await openaiClient.chat.completions.create({
    model:           AI_MODEL,
    temperature:     0.1, // Low temperature for consistent, reproducible scoring
    max_tokens:      512,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildRiskScoringSystemPrompt() },
      { role: "user",   content: buildRiskScoringUserPrompt(context) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI risk scoring module");

  const result = parseAIJson<RiskScoringResult>(content);

  // Clamp score to valid range
  result.riskScore = Math.max(0, Math.min(100, Math.round(result.riskScore)));

  // Enforce score-to-level consistency regardless of AI output
  if      (result.riskScore <= 30) result.riskLevel = "low";
  else if (result.riskScore <= 60) result.riskLevel = "medium";
  else if (result.riskScore <= 80) result.riskLevel = "high";
  else                             result.riskLevel = "critical";

  // Guarantee arrays + fields are present
  result.safetyFlags           = result.safetyFlags           ?? [];
  result.requiresEmergencyReferral = result.requiresEmergencyReferral ?? false;
  result.reasoning             = result.reasoning             ?? "";
  result.recommendedTimeframe  = result.recommendedTimeframe  ?? deriveTimeframe(result.riskLevel);

  return result;
}

/** Fallback timeframe derivation when AI omits the field */
function deriveTimeframe(level: RiskScoringResult["riskLevel"]): string {
  const map: Record<typeof level, string> = {
    low:      "routine appointment within 1–2 weeks",
    medium:   "within 24–48 hours",
    high:     "within 2–4 hours",
    critical: "immediately — call 911 or go to the nearest emergency room",
  };
  return map[level];
}

// ─────────────────────────────────────────────────────────────────
// Stage 3 — Report Generation
// ─────────────────────────────────────────────────────────────────

const MANDATORY_DISCLAIMER =
  "This AI-generated report is for clinical reference only and does not constitute a medical diagnosis. A licensed physician must review and validate all findings before any clinical decision is made.";

/**
 * Generate the complete structured pre-consultation report.
 * Passes extraction and risk reasoning context to produce a richer,
 * more accurate report without re-inferring what is already known.
 */
export async function generateTriageReport(
  context: ReportContext
): Promise<ReportResult> {
  const response = await openaiClient.chat.completions.create({
    model:           AI_MODEL,
    temperature:     AI_TEMPERATURE,
    max_tokens:      AI_MAX_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildReportSystemPrompt() },
      { role: "user",   content: buildReportUserPrompt(context) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI report generation module");

  const result = parseAIJson<ReportResult>(content);

  // Safety net — disclaimer must always be present
  if (!result.disclaimer) {
    result.disclaimer = MANDATORY_DISCLAIMER;
  }

  // Guarantee arrays are always present
  result.recommendations  = result.recommendations  ?? [];
  result.redFlags         = result.redFlags         ?? [];
  result.followUpTimeframe = result.followUpTimeframe ?? "";

  // Cap conditions at 5
  if (result.possibleConditions?.length > 5) {
    result.possibleConditions = result.possibleConditions.slice(0, 5);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Synchronous emergency keyword check
//
// Runs BEFORE any AI call to immediately flag life-threatening
// phrases in the chief complaint. This is a safety net — the full
// extraction stage will also catch red flags via AI.
// ─────────────────────────────────────────────────────────────────

const EMERGENCY_PATTERNS: { pattern: RegExp; flag: string }[] = [
  { pattern: /chest pain/i,
    flag: "Chest pain reported — possible cardiac event" },
  { pattern: /can't breathe|cannot breathe|difficulty breathing|shortness of breath/i,
    flag: "Breathing difficulty reported — possible respiratory emergency" },
  { pattern: /stroke|face drooping|arm weakness|speech difficulty|slurred speech/i,
    flag: "Possible stroke symptoms — FAST protocol applies" },
  { pattern: /unconscious|passed out|fainted|loss of consciousness/i,
    flag: "Loss of consciousness reported" },
  { pattern: /severe bleeding|uncontrolled bleeding|blood loss/i,
    flag: "Severe bleeding reported" },
  { pattern: /allergic reaction|anaphylaxis|throat closing|throat tightening/i,
    flag: "Possible anaphylaxis — airway compromise risk" },
  { pattern: /suicidal|want to die|kill myself|end my life/i,
    flag: "Mental health crisis — immediate referral required" },
  { pattern: /overdose|took too many pills/i,
    flag: "Possible medication overdose" },
  { pattern: /severe abdominal pain|worst pain.*of my life|10 out of 10/i,
    flag: "Maximum severity pain reported" },
  { pattern: /radiating.*arm|radiating.*jaw|pain.*left arm|pain.*shoulder/i,
    flag: "Radiating chest/arm pain — possible cardiac involvement" },
];

/**
 * Fast synchronous keyword scan run before any AI call.
 * Returns detected flag descriptions for immediate safety escalation.
 */
export function checkEmergencyKeywords(text: string): string[] {
  return EMERGENCY_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ flag }) => flag);
}

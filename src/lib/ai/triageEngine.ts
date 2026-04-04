import openaiClient, { AI_MODEL, AI_MAX_TOKENS, AI_TEMPERATURE } from "./client";
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
// Orchestrates the three-stage AI pipeline:
//   1. Adaptive questioning
//   2. Risk scoring
//   3. Report generation
// ─────────────────────────────────────────────────────────────────

/**
 * Parse JSON from AI response, handling markdown code fences if present.
 */
function parseAIJson<T>(content: string): T {
  // Strip markdown code fences if AI wraps the JSON
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`AI returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Stage 1: Generate the next adaptive question.
 */
export async function generateNextQuestion(
  context: QuestioningContext
): Promise<NextQuestionResult> {
  const response = await openaiClient.chat.completions.create({
    model: AI_MODEL,
    temperature: AI_TEMPERATURE,
    max_tokens: 256,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildQuestioningSystemPrompt(),
      },
      {
        role: "user",
        content: buildQuestioningUserPrompt(context),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI questioning module");

  const result = parseAIJson<NextQuestionResult>(content);

  // Validate required fields
  if (!result.questionId || !result.question) {
    throw new Error("AI questioning response missing required fields");
  }

  // Force last question after max
  if (context.answeredQuestions.length >= 7) {
    result.isLastQuestion = true;
    result.progress = 100;
  }

  return result;
}

/**
 * Stage 2: Calculate risk score from the full conversation.
 */
export async function calculateRiskScore(
  context: RiskScoringContext
): Promise<RiskScoringResult> {
  const response = await openaiClient.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.1, // Low temperature for consistent scoring
    max_tokens: 512,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildRiskScoringSystemPrompt(),
      },
      {
        role: "user",
        content: buildRiskScoringUserPrompt(context),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI risk scoring module");

  const result = parseAIJson<RiskScoringResult>(content);

  // Validate and clamp risk score
  result.riskScore = Math.max(0, Math.min(100, Math.round(result.riskScore)));

  // Ensure riskLevel matches riskScore
  if (result.riskScore <= 30) result.riskLevel = "low";
  else if (result.riskScore <= 60) result.riskLevel = "medium";
  else if (result.riskScore <= 80) result.riskLevel = "high";
  else result.riskLevel = "critical";

  return result;
}

/**
 * Stage 3: Generate the full triage report.
 */
export async function generateTriageReport(
  context: ReportContext
): Promise<ReportResult> {
  const response = await openaiClient.chat.completions.create({
    model: AI_MODEL,
    temperature: AI_TEMPERATURE,
    max_tokens: AI_MAX_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildReportSystemPrompt(),
      },
      {
        role: "user",
        content: buildReportUserPrompt(context),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI report module");

  const result = parseAIJson<ReportResult>(content);

  // Safety validation — ensure disclaimer is always present
  if (!result.disclaimer) {
    result.disclaimer =
      "This AI-generated report is for clinical reference only and does not constitute a medical diagnosis. A licensed physician must review and validate all findings.";
  }

  // Limit to 5 conditions max
  if (result.possibleConditions?.length > 5) {
    result.possibleConditions = result.possibleConditions.slice(0, 5);
  }

  return result;
}

/**
 * Emergency keyword check — runs synchronously before any AI call
 * to immediately flag potentially life-threatening symptoms.
 */
export function checkEmergencyKeywords(text: string): string[] {
  const emergencyPatterns = [
    { pattern: /chest pain/i, flag: "Chest pain reported — cardiac event possible" },
    { pattern: /can't breathe|cannot breathe|difficulty breathing|shortness of breath/i, flag: "Breathing difficulty reported — respiratory emergency possible" },
    { pattern: /stroke|face drooping|arm weakness|speech difficulty/i, flag: "Possible stroke symptoms — FAST protocol applies" },
    { pattern: /unconscious|passed out|fainted|loss of consciousness/i, flag: "Loss of consciousness reported" },
    { pattern: /severe bleeding|uncontrolled bleeding|blood loss/i, flag: "Severe bleeding reported" },
    { pattern: /allergic reaction|anaphylaxis|throat closing/i, flag: "Possible anaphylaxis — airway compromise risk" },
    { pattern: /suicidal|want to die|kill myself/i, flag: "Mental health crisis — immediate referral required" },
    { pattern: /overdose|took too many pills/i, flag: "Possible medication overdose" },
    { pattern: /severe abdominal pain|worst pain|10 out of 10/i, flag: "Severe pain intensity reported" },
  ];

  return emergencyPatterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ flag }) => flag);
}

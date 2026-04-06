import openaiClient, { AI_MODEL, AI_FAST_MODEL, AI_MAX_TOKENS, AI_TEMPERATURE } from "./client";
import { withRetry } from "./retry";
import {
  parseAndValidate,
  SymptomExtractionResultSchema,
  NextQuestionResultSchema,
  StreamingMetaSchema,
  RiskScoringResultSchema,
  ReportResultSchema,
} from "./validation";
import {
  buildSymptomExtractionSystemPrompt,
  buildSymptomExtractionUserPrompt,
  type SymptomExtractionContext,
  type SymptomExtractionResult,
} from "./prompts/symptomExtraction";
import {
  buildQuestioningSystemPrompt,
  buildQuestioningUserPrompt,
  buildStreamingQuestioningSystemPrompt,
  buildStreamingQuestioningUserPrompt,
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
//
// All stages:
//   • Retry up to 3× with exponential backoff on transient errors
//   • Validate output with Zod schemas (parseAndValidate)
//   • Log token usage for cost visibility
// ─────────────────────────────────────────────────────────────────

function logTokens(stage: string, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null) {
  if (!usage) return;
  console.info(
    `[AI:${stage}] tokens — prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`
  );
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
  return withRetry(
    async () => {
      const response = await openaiClient.chat.completions.create({
        model:           AI_FAST_MODEL,   // fast model — simple NLP extraction
        temperature:     0.1,
        max_tokens:      400,             // extraction needs < 400 tokens
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSymptomExtractionSystemPrompt() },
          { role: "user",   content: buildSymptomExtractionUserPrompt(context) },
        ],
      });

      logTokens("extractSymptoms", response.usage);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("[AI:extractSymptoms] Empty response from model");

      const result = parseAndValidate(
        SymptomExtractionResultSchema,
        content,
        "extractSymptoms",
      );

      // Fall back to the raw complaint text if primarySymptom is missing
      if (!result.primarySymptom) {
        result.primarySymptom = context.chiefComplaint.slice(0, 80);
      }

      return result as SymptomExtractionResult;
    },
    {
      maxAttempts: 3,
      onRetry: (n, err) =>
        console.warn(`[AI:extractSymptoms] retry ${n} — ${err.message}`),
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// Stage 1 — Adaptive Questioning
// ─────────────────────────────────────────────────────────────────

/**
 * Generate the next adaptive follow-up question.
 * Returns `inputType` so the UI renders the correct control.
 */
export async function generateNextQuestion(
  context: QuestioningContext
): Promise<NextQuestionResult> {
  return withRetry(
    async () => {
      const response = await openaiClient.chat.completions.create({
        model:           AI_FAST_MODEL,   // fast model — question generation is quick
        temperature:     AI_TEMPERATURE,
        max_tokens:      200,             // one question never needs more than 200 tokens
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildQuestioningSystemPrompt() },
          { role: "user",   content: buildQuestioningUserPrompt(context) },
        ],
      });

      logTokens("generateNextQuestion", response.usage);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("[AI:generateNextQuestion] Empty response from model");

      const result = parseAndValidate(
        NextQuestionResultSchema,
        content,
        "generateNextQuestion",
      );

      // Force last-question flag at hard limit
      if (context.answeredQuestions.length >= 7) {
        result.isLastQuestion = true;
        result.progress       = 100;
      }

      return result as NextQuestionResult;
    },
    {
      maxAttempts: 3,
      onRetry: (n, err) =>
        console.warn(`[AI:generateNextQuestion] retry ${n} — ${err.message}`),
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// Stage 1 (streaming variant) — Real-time question delivery via SSE
// ─────────────────────────────────────────────────────────────────

export interface StreamingQuestionEvent {
  type:     "token" | "meta" | "complete" | "progress";
  text?:    string;
  meta?:    NextQuestionResult;
  message?: string;   // used by "progress" events
  step?:    number;   // used by "progress" events (1-based)
}

/**
 * Stream the next question as it's generated by the AI.
 *
 * The model outputs in a delimited format:
 *   <question text>
 *   ---
 *   {"questionId":"q_2","inputType":"text", ...}
 *
 * The returned async generator emits:
 *   • { type: "token", text: "..." } — one token at a time (question text only)
 *   • { type: "meta",  meta: {...}  } — after the delimiter (parsed metadata)
 *
 * Callers pipe these events to an SSE response or a ReadableStream.
 */
export async function* streamNextQuestion(
  context: QuestioningContext
): AsyncGenerator<StreamingQuestionEvent> {
  const stream = await withRetry(
    () => openaiClient.chat.completions.create({
      model:       AI_FAST_MODEL,
      temperature: AI_TEMPERATURE,
      max_tokens:  250,             // streaming question text never needs more
      stream:      true,
      messages: [
        { role: "system", content: buildStreamingQuestioningSystemPrompt() },
        { role: "user",   content: buildStreamingQuestioningUserPrompt(context) },
      ],
    }),
    { maxAttempts: 3, onRetry: (n, err) => console.warn(`[AI:streamNextQuestion] retry ${n} — ${err.message}`) },
  );

  let buffer       = "";
  let totalEmitted = 0;     // chars of buffer already sent as token events
  let metaMode     = false; // true once the \n--- delimiter has been consumed

  // The model is instructed to output:
  //   <question text>
  //   ---
  //   {json metadata}
  //
  // In practice it may omit the newline *after* "---", outputting either:
  //   \n---\n{...}  or  \n---{...}
  //
  // We therefore search for "\n---" (no trailing newline required) and strip
  // any leading whitespace from whatever follows it.
  const DELIMITER = "\n---";
  // LOOKAHEAD: hold back enough chars that a delimiter split across two chunks
  // is never prematurely emitted.  +2 accounts for the optional \n after "---".
  const LOOKAHEAD = DELIMITER.length + 2;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;
    buffer += delta;

    if (!metaMode) {
      const delimIdx = buffer.indexOf(DELIMITER);
      if (delimIdx !== -1) {
        // Emit any un-sent question text that precedes the delimiter
        if (delimIdx > totalEmitted) {
          yield { type: "token", text: buffer.slice(totalEmitted, delimIdx) };
        }
        metaMode     = true;
        totalEmitted = 0;
        // Consume the delimiter and strip optional whitespace/newline before JSON
        buffer = buffer.slice(delimIdx + DELIMITER.length).replace(/^[\s\r\n]*/, "");
      } else {
        // Emit everything except the LOOKAHEAD tail which may be the start
        // of a delimiter split across two network chunks.
        const safeUpTo = Math.max(totalEmitted, buffer.length - LOOKAHEAD);
        if (safeUpTo > totalEmitted) {
          yield { type: "token", text: buffer.slice(totalEmitted, safeUpTo) };
          totalEmitted = safeUpTo;
        }
      }
    }
    // metaMode: silently accumulate the JSON metadata
  }

  // Stream ended — flush remaining question text when delimiter was never seen.
  // Priority order: \n--- boundary → \n{ boundary → emit all as text (last resort).
  if (!metaMode) {
    const sepIdx = buffer.indexOf("\n---");
    if (sepIdx !== -1) {
      // Found the separator without trailing newline variant
      if (sepIdx > totalEmitted) {
        yield { type: "token", text: buffer.slice(totalEmitted, sepIdx) };
      }
      buffer = buffer.slice(sepIdx + DELIMITER.length).replace(/^[\s\r\n]*/, "");
    } else {
      const jsonStart = buffer.indexOf("\n{");
      if (jsonStart !== -1 && jsonStart >= totalEmitted) {
        // Fallback: split on the first bare \n{ boundary
        yield { type: "token", text: buffer.slice(totalEmitted, jsonStart) };
        buffer = buffer.slice(jsonStart + 1); // leave only the JSON
      } else {
        // No metadata found at all — emit all remaining text and clear
        if (buffer.length > totalEmitted) {
          yield { type: "token", text: buffer.slice(totalEmitted) };
        }
        buffer = "";
      }
    }
  }

  // Parse the metadata JSON that accumulated after the delimiter.
  // Use StreamingMetaSchema (question is optional) because the question text
  // was delivered as token events — it is not expected in this JSON block.
  const metaJson = buffer.trim();
  if (metaJson) {
    try {
      const parsed = parseAndValidate(
        StreamingMetaSchema,
        metaJson.startsWith("{") ? metaJson : `{${metaJson}}`,
        "streamNextQuestion:meta",
      );

      if (context.answeredQuestions.length >= 7) {
        parsed.isLastQuestion = true;
        parsed.progress       = 100;
      }

      yield { type: "meta", meta: parsed as NextQuestionResult };
    } catch (err) {
      console.error("[AI:streamNextQuestion] Failed to parse metadata:", err);
      // Emit a safe fallback so the client isn't left hanging
      yield {
        type: "meta",
        meta: {
          questionId:     `q_${context.answeredQuestions.length + 2}`,
          question:       "",
          inputType:      "text",
          category:       "history",
          isLastQuestion: context.answeredQuestions.length >= 7,
          progress:       Math.min((context.answeredQuestions.length + 2) * 12, 100),
        },
      };
    }
  }
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
  return withRetry(
    async () => {
      const response = await openaiClient.chat.completions.create({
        model:           AI_MODEL,
        temperature:     0.1,
        max_tokens:      500,             // risk output is compact JSON
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildRiskScoringSystemPrompt() },
          { role: "user",   content: buildRiskScoringUserPrompt(context) },
        ],
      });

      logTokens("calculateRiskScore", response.usage);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("[AI:calculateRiskScore] Empty response from model");

      const result = parseAndValidate(
        RiskScoringResultSchema,
        content,
        "calculateRiskScore",
      );

      // Clamp score regardless of AI output
      result.riskScore = Math.max(0, Math.min(100, Math.round(result.riskScore)));

      // Enforce score-level consistency
      if      (result.riskScore <= 30) result.riskLevel = "low";
      else if (result.riskScore <= 60) result.riskLevel = "medium";
      else if (result.riskScore <= 80) result.riskLevel = "high";
      else                             result.riskLevel = "critical";

      if (!result.recommendedTimeframe) {
        result.recommendedTimeframe = deriveTimeframe(result.riskLevel);
      }

      return result as RiskScoringResult;
    },
    {
      maxAttempts: 3,
      onRetry: (n, err) =>
        console.warn(`[AI:calculateRiskScore] retry ${n} — ${err.message}`),
    }
  );
}

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
 */
export async function generateTriageReport(
  context: ReportContext
): Promise<ReportResult> {
  return withRetry(
    async () => {
      const response = await openaiClient.chat.completions.create({
        model:           AI_MODEL,
        temperature:     AI_TEMPERATURE,
        max_tokens:      Math.min(AI_MAX_TOKENS, 1200), // cap report at 1200; 2048 is wasteful
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildReportSystemPrompt() },
          { role: "user",   content: buildReportUserPrompt(context) },
        ],
      });

      logTokens("generateTriageReport", response.usage);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("[AI:generateTriageReport] Empty response from model");

      const result = parseAndValidate(
        ReportResultSchema,
        content,
        "generateTriageReport",
      );

      if (!result.disclaimer) {
        result.disclaimer = MANDATORY_DISCLAIMER;
      }

      if (result.possibleConditions.length > 5) {
        result.possibleConditions = result.possibleConditions.slice(0, 5);
      }

      return result as ReportResult;
    },
    {
      maxAttempts: 3,
      onRetry: (n, err) =>
        console.warn(`[AI:generateTriageReport] retry ${n} — ${err.message}`),
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// Synchronous emergency keyword scan
//
// Runs BEFORE any AI call to immediately flag life-threatening
// phrases in the chief complaint. Safety net — the full extraction
// stage also catches red flags via AI.
// ─────────────────────────────────────────────────────────────────

const EMERGENCY_PATTERNS: { pattern: RegExp; flag: string }[] = [
  { pattern: /chest\s+pain/i,
    flag: "Chest pain reported — possible cardiac event" },
  { pattern: /can(?:'t| not)\s+breathe|cannot\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath/i,
    flag: "Breathing difficulty reported — possible respiratory emergency" },
  { pattern: /stroke|face\s+droop|arm\s+weakness|speech\s+difficult|slurred\s+speech/i,
    flag: "Possible stroke symptoms — FAST protocol applies" },
  { pattern: /unconscious|passed?\s+out|faint(?:ed|ing)|loss\s+of\s+consciousness/i,
    flag: "Loss of consciousness reported" },
  { pattern: /severe\s+bleeding|uncontrolled\s+bleeding|blood\s+loss/i,
    flag: "Severe bleeding reported" },
  { pattern: /allergic\s+reaction|anaphylax|throat\s+clos|throat\s+tighten/i,
    flag: "Possible anaphylaxis — airway compromise risk" },
  { pattern: /suicid|want\s+to\s+die|kill\s+myself|end\s+my\s+life/i,
    flag: "Mental health crisis — immediate referral required" },
  { pattern: /overdose|took\s+too\s+many\s+pills/i,
    flag: "Possible medication overdose" },
  { pattern: /severe\s+abdominal\s+pain|worst\s+(?:pain|headache)\s+of\s+my\s+life|10\s*(?:out\s*of\s*10|\/10)/i,
    flag: "Maximum severity pain reported" },
  { pattern: /radiating\s+(?:to\s+)?(?:arm|jaw|shoulder)|pain\s+(?:in|down)\s+(?:left\s+)?arm/i,
    flag: "Radiating chest/arm pain — possible cardiac involvement" },
  { pattern: /not\s+breathing|stopped?\s+breathing|cardiac\s+arrest/i,
    flag: "Respiratory or cardiac arrest reported" },
  { pattern: /seizure|convuls/i,
    flag: "Seizure activity reported" },
  { pattern: /diabetic\s+emergency|blood\s+sugar|hypoglycemi/i,
    flag: "Possible diabetic emergency" },
];

/**
 * Fast synchronous keyword scan before any AI call.
 * Returns detected flag descriptions for immediate safety escalation.
 */
export function checkEmergencyKeywords(text: string): string[] {
  return EMERGENCY_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ flag }) => flag);
}

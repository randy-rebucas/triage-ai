// ─────────────────────────────────────────────────────────────────
// AI Prompt: Adaptive Questioning
//
// Stage 1 of the triage pipeline — runs after symptom extraction.
// Generates the next clarifying question, choosing the best clinical
// dimension to cover based on what's already known.
//
// Two variants:
//   buildQuestioningSystemPrompt / buildQuestioningUserPrompt
//     → standard JSON output (response_format: json_object)
//
//   buildStreamingQuestioningSystemPrompt / buildStreamingQuestioningUserPrompt
//     → delimited text output for real-time SSE streaming:
//       <question text>
//       ---
//       {"questionId":"q_2","inputType":"text",...}
// ─────────────────────────────────────────────────────────────────

import type {
  SymptomExtractionResult,
  ClinicalDimension,
} from "./symptomExtraction";

// ─── Types ───────────────────────────────────────────────────────

export interface QuestioningContext {
  chiefComplaint: string;
  answeredQuestions: {
    question: string;
    answer:   string;
  }[];
  patientAge?:        number;
  patientGender?:     string;
  /** Structured extraction from Stage 0 — available after first question */
  extractedSymptoms?: SymptomExtractionResult;
}

export interface NextQuestionResult {
  /** Unique question identifier, e.g. "q_1", "q_2" */
  questionId: string;

  /** Plain-language question text displayed to the patient */
  question: string;

  /**
   * Recommended UI control:
   *   text    → free-form textarea
   *   yes_no  → Yes / No toggle buttons
   *   slider  → 0–10 pain/severity rating slider
   */
  inputType: "text" | "yes_no" | "slider";

  /** Clinical dimension this question addresses */
  category: ClinicalDimension;

  /** True when the AI has enough data and this is the final question */
  isLastQuestion: boolean;

  /** Estimated completion percentage (0–100) */
  progress: number;
}

// ─── Shared content blocks ────────────────────────────────────────

const DIMENSION_GUIDE = `━━━ CLINICAL DIMENSIONS (priority order) ━━━
  1. onset        → How did it start? (sudden vs gradual)
  2. duration     → How long has this been happening?
  3. severity     → How bad is it right now? (ask as a 0–10 scale → slider)
  4. location     → Where exactly does it hurt or feel wrong?
  5. character    → What does it feel like? (sharp, dull, burning, pressure…)
  6. radiation    → Does it spread or move anywhere? (yes_no)
  7. aggravating  → What makes it worse?
  8. relieving    → What makes it better?
  9. associated   → Any other symptoms occurring at the same time? (yes_no)
  10. history     → Any past episodes or relevant medical history? (yes_no)`;

const INPUT_TYPE_RULES = `━━━ INPUT TYPE RULES ━━━
  yes_no → Answer is naturally Yes or No. Use for:
    • "Have you had this before?"
    • "Do you have any known heart conditions?"
    • "Does the pain spread to your arm, jaw, or shoulder?"
    • "Are you currently taking any medications?"
    • "Are you having any difficulty breathing?"

  slider → Patient rates something 0–10. Use ONLY for:
    • "On a scale of 0–10, how would you rate the pain right now?"
    • "How severe are your symptoms on a scale of 0 to 10?"

  text → All other open-ended questions. Use for:
    • "How would you describe the sensation?"
    • "What were you doing when it started?"
    • "How long ago did this begin?"
    • "What makes it better or worse?"`;

const QUESTION_RULES = `━━━ QUESTION RULES ━━━
- Ask exactly ONE question per turn
- Use plain, empathetic, non-clinical language
- NEVER suggest possible diagnoses in the question wording
- If there are red-flag phrases in the complaint (chest pain, breathing difficulty,
  loss of consciousness), prioritise severity/radiation/associated before other dims
- Stop after 8 questions maximum, or earlier if data is clinically sufficient
- Output ONLY valid JSON — no markdown, no explanation`;

const FEW_SHOT_EXAMPLES = `━━━ FEW-SHOT EXAMPLES ━━━

Example 1 — first question, chief complaint: "I have a headache"
Missing dims: onset, duration, severity, location, character, radiation, aggravating, relieving, associated, history
→ {
  "questionId": "q_1",
  "question": "When did your headache start — was it sudden like a thunderclap, or did it come on gradually?",
  "inputType": "text",
  "category": "onset",
  "isLastQuestion": false,
  "progress": 12
}

Example 2 — second question, onset already answered, severity missing
→ {
  "questionId": "q_2",
  "question": "On a scale of 0 to 10, how would you rate the headache right now, where 0 is no pain and 10 is the worst pain you can imagine?",
  "inputType": "slider",
  "category": "severity",
  "isLastQuestion": false,
  "progress": 25
}

Example 3 — history dimension, late in conversation
→ {
  "questionId": "q_7",
  "question": "Have you had migraines or similar headaches in the past?",
  "inputType": "yes_no",
  "category": "history",
  "isLastQuestion": false,
  "progress": 85
}

Example 4 — final question
→ {
  "questionId": "q_8",
  "question": "Are you currently taking any medications, including over-the-counter drugs or supplements?",
  "inputType": "yes_no",
  "category": "history",
  "isLastQuestion": true,
  "progress": 100
}`;

// ─── Standard JSON prompt builders ───────────────────────────────

export function buildQuestioningSystemPrompt(): string {
  return `You are a medical triage assistant gathering symptom data before a doctor review.
You do NOT provide diagnoses, treatment advice, or medical opinions.
Your only job is to ask one focused, empathetic question that fills the most important information gap.

${DIMENSION_GUIDE}

${INPUT_TYPE_RULES}

${QUESTION_RULES}

${FEW_SHOT_EXAMPLES}

━━━ OUTPUT FORMAT (strict JSON, no markdown) ━━━
{
  "questionId": "q_1",
  "question": "...",
  "inputType": "text",
  "category": "onset",
  "isLastQuestion": false,
  "progress": 12
}`;
}

export function buildQuestioningUserPrompt(
  context: QuestioningContext
): string {
  const {
    chiefComplaint,
    answeredQuestions,
    patientAge,
    patientGender,
    extractedSymptoms,
  } = context;

  const patientLine = [
    patientAge    ? `Age: ${patientAge}`       : null,
    patientGender ? `Gender: ${patientGender}` : null,
  ].filter(Boolean).join(" | ");

  const coveredByHistory = inferCoveredDimensions(
    answeredQuestions,
    extractedSymptoms?.coveredDimensions ?? []
  );
  const allDimensions = Object.keys(DIMENSION_KEYWORDS);
  const missing = allDimensions.filter((d) => !coveredByHistory.includes(d));

  let extractionBlock = "";
  if (extractedSymptoms) {
    const hasFlags = extractedSymptoms.redFlagLanguage.length > 0;
    extractionBlock = `
Structured extraction from chief complaint:
  Primary symptom : ${extractedSymptoms.primarySymptom}
  Body system     : ${extractedSymptoms.bodySystem}
  Duration        : ${extractedSymptoms.duration  ?? "unknown"}
  Severity        : ${extractedSymptoms.severity  ?? "unknown"}
  Onset           : ${extractedSymptoms.onset     ?? "unknown"}${hasFlags ? `\n  ⚠ Red flags     : ${extractedSymptoms.redFlagLanguage.join(", ")}` : ""}
`;
  }

  const history =
    answeredQuestions.length > 0
      ? answeredQuestions
          .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
          .join("\n\n")
      : "No follow-up questions answered yet.";

  const nextNumber = answeredQuestions.length + 1;

  return `Patient: ${patientLine || "Not provided"}

Chief Complaint:
"${chiefComplaint}"
${extractionBlock}
━━━ DIMENSION TRACKING ━━━
Already covered (DO NOT ask about these again): ${coveredByHistory.length ? coveredByHistory.join(", ") : "none"}
Still missing (prioritise in this order): ${missing.length ? missing.join(", ") : "all covered — use clinical judgment"}

Conversation so far (${answeredQuestions.length}/8 questions answered):
${history}

Task: Generate question ${nextNumber} — the single most important MISSING clarifying question.
CRITICAL: You MUST NOT ask about any dimension already listed as "covered" above.
- If this is question 8, or you have sufficient data to complete assessment, set isLastQuestion to true.
- Choose the inputType that best fits the question (see rules above).
- Set progress proportional to completion (question ${nextNumber} of ~8).

Respond with ONLY valid JSON.`;
}

// ─── Streaming prompt builders ────────────────────────────────────
// These produce a plain-text + delimited format instead of JSON so
// the question text can be streamed token-by-token via SSE.
//
// Output format:
//   <question text on one or more lines>
//   ---
//   {"questionId":"q_2","inputType":"text","category":"duration","isLastQuestion":false,"progress":25}

export function buildStreamingQuestioningSystemPrompt(): string {
  return `You are a medical triage assistant gathering symptom data before a doctor review.
Your only job is to ask one focused, empathetic question that fills the most important information gap.
You do NOT provide diagnoses, treatment advice, or medical opinions.

${DIMENSION_GUIDE}

${INPUT_TYPE_RULES}

━━━ STRICT OUTPUT FORMAT ━━━
Output EXACTLY two parts separated by a line containing only "---":

Part 1 — The question text (plain English, no quotes, no markdown):
How long ago did your symptoms start?

Part 2 — A single line of valid JSON with these fields:
{"questionId":"q_2","inputType":"text","category":"duration","isLastQuestion":false,"progress":25}

RULES:
- Do NOT output anything else (no labels, no explanation, no code fences)
- Do NOT put quotes around the question text
- The separator line must be exactly: ---
- isLastQuestion is true only if this is the final question (question 8 or enough data)`;
}

// ── Dimension keywords used to infer which clinical dimensions an
//    answered Q&A pair has already addressed. ─────────────────────
const DIMENSION_KEYWORDS: Record<string, string[]> = {
  onset:       ["start", "began", "sudden", "gradual", "thunderclap", "come on", "happen"],
  duration:    ["long", "how long", "days", "weeks", "hours", "since", "duration"],
  severity:    ["scale", "rate", "0 to 10", "1 to 10", "pain level", "severe", "bad", "worst"],
  location:    ["where", "which", "side", "part", "area", "spot", "location"],
  character:   ["feel", "describe", "sensation", "sharp", "dull", "burning", "pressure", "aching"],
  radiation:   ["spread", "move", "radiate", "arm", "jaw", "shoulder", "back", "radiation"],
  aggravating: ["worse", "worsen", "aggravate", "trigger", "makes it worse"],
  relieving:   ["better", "relieve", "relief", "help", "ease"],
  associated:  ["other symptom", "also experiencing", "along with", "nausea", "fever", "dizzy"],
  history:     ["before", "past", "history", "previous", "ever had", "medication", "allergy"],
};

/**
 * Infer which clinical dimensions are covered by a set of Q&A pairs.
 * Uses simple keyword matching — good enough for prompt context.
 */
function inferCoveredDimensions(
  answeredQuestions: { question: string; answer: string }[],
  extractionCovered: string[] = []
): string[] {
  const covered = new Set(extractionCovered);
  for (const { question } of answeredQuestions) {
    const q = question.toLowerCase();
    for (const [dim, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
      if (keywords.some((kw) => q.includes(kw))) covered.add(dim);
    }
  }
  return Array.from(covered);
}

export function buildStreamingQuestioningUserPrompt(
  context: QuestioningContext
): string {
  const {
    chiefComplaint,
    answeredQuestions,
    patientAge,
    patientGender,
    extractedSymptoms,
  } = context;

  const patientLine = [
    patientAge    ? `Age: ${patientAge}`       : null,
    patientGender ? `Gender: ${patientGender}` : null,
  ].filter(Boolean).join(" | ");

  // Compute covered dims from both the extraction result AND the Q&A history
  const coveredByHistory = inferCoveredDimensions(
    answeredQuestions,
    extractedSymptoms?.coveredDimensions ?? []
  );
  const allDimensions = Object.keys(DIMENSION_KEYWORDS);
  const missing = allDimensions.filter((d) => !coveredByHistory.includes(d));

  let extractionBlock = "";
  if (extractedSymptoms) {
    const hasFlags = extractedSymptoms.redFlagLanguage.length > 0;
    extractionBlock = `
Symptom extraction:
  Primary symptom : ${extractedSymptoms.primarySymptom}
  Body system     : ${extractedSymptoms.bodySystem}
  Duration        : ${extractedSymptoms.duration  ?? "unknown"}
  Severity        : ${extractedSymptoms.severity  ?? "unknown"}
  Onset           : ${extractedSymptoms.onset     ?? "unknown"}${hasFlags ? `\n  ⚠ Red flags : ${extractedSymptoms.redFlagLanguage.join(", ")}` : ""}
`;
  }

  const history =
    answeredQuestions.length > 0
      ? answeredQuestions
          .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
          .join("\n\n")
      : "No prior questions answered.";

  const nextNumber = answeredQuestions.length + 1;

  return `Patient: ${patientLine || "Not provided"}
Chief Complaint: "${chiefComplaint}"
${extractionBlock}
━━━ DIMENSION TRACKING ━━━
Already covered (DO NOT ask about these again): ${coveredByHistory.length ? coveredByHistory.join(", ") : "none"}
Still missing (prioritise in this order): ${missing.length ? missing.join(", ") : "all covered — use clinical judgment"}

━━━ CONVERSATION HISTORY (${answeredQuestions.length}/8 answered) ━━━
${history}

Generate question ${nextNumber}.
CRITICAL: You MUST NOT ask about any dimension already listed as "covered" above.
Pick the single most important MISSING dimension.
${answeredQuestions.length >= 7 ? "This MUST be the last question — set isLastQuestion: true." : ""}

Output format: question text, then ---, then JSON metadata.`;
}

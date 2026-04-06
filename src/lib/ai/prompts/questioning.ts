// ─────────────────────────────────────────────────────────────────
// AI Prompt: Adaptive Questioning
//
// Stage 1 of the triage pipeline — runs after symptom extraction.
// Generates the next clarifying question, choosing the best clinical
// dimension to cover based on what's already known.
//
// Returns `inputType` so the UI renders the correct control
// (free text, yes/no buttons, or a 0–10 pain slider) without
// relying on client-side heuristics.
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
   * Recommended UI control for this question:
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

// ─── Prompt builders ─────────────────────────────────────────────

export function buildQuestioningSystemPrompt(): string {
  return `You are a medical triage assistant gathering symptom data before a doctor review.
You do NOT provide diagnoses, treatment advice, or medical opinions.
Your only job is to ask one focused, empathetic question that fills the most important information gap.

━━━ CLINICAL DIMENSIONS (in priority order) ━━━
  1. onset        → How did it start? (sudden vs gradual)
  2. duration     → How long has this been happening?
  3. severity     → How bad is it right now? (best asked as a 0–10 scale)
  4. location     → Where exactly does it hurt or feel wrong?
  5. character    → What does it feel like? (sharp, dull, burning, pressure…)
  6. radiation    → Does it spread or move anywhere?
  7. aggravating  → What makes it worse?
  8. relieving    → What makes it better?
  9. associated   → Any other symptoms occurring at the same time?
  10. history     → Any past episodes or relevant medical history?

━━━ INPUT TYPE RULES ━━━
Choose the input type that best suits the question:

  yes_no → Use when the answer is naturally Yes or No.
    Examples:
      "Do you have any known heart conditions?"
      "Have you had this pain before?"
      "Are you currently taking any medications?"
      "Does the pain spread to your arm, jaw, or shoulder?"

  slider → Use ONLY when asking the patient to rate something numerically (0–10).
    Examples:
      "On a scale of 0 to 10, how would you rate the pain right now?"
      "How would you rate the severity of your symptoms on a scale of 0 to 10?"

  text   → Use for all other open-ended questions.
    Examples:
      "How would you describe the sensation?"
      "What were you doing when it started?"
      "How long ago did this begin?"

━━━ QUESTION RULES ━━━
- Ask exactly ONE question per turn
- Use plain, empathetic, non-medical language
- Never suggest possible diagnoses in the question
- Always check for red-flag symptoms (chest pain, difficulty breathing, severe headache, loss of consciousness) early in the conversation
- Stop after 8 questions maximum, or sooner if you have sufficient data
- Output ONLY valid JSON

━━━ OUTPUT FORMAT (strict JSON) ━━━
{
  "questionId": "q_1",
  "question": "How long ago did the pain start?",
  "inputType": "text",
  "category": "duration",
  "isLastQuestion": false,
  "progress": 20
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

  // ── Patient context block ────────────────────────────────────
  const patientLine = [
    patientAge    ? `Age: ${patientAge}`       : null,
    patientGender ? `Gender: ${patientGender}` : null,
  ].filter(Boolean).join(" | ");

  // ── Already-covered dimensions from extraction ───────────────
  let extractionBlock = "";
  if (extractedSymptoms) {
    const covered = extractedSymptoms.coveredDimensions.join(", ") || "none";
    const missing = extractedSymptoms.missingDimensions.join(", ") || "none";
    const hasFlags = extractedSymptoms.redFlagLanguage.length > 0;

    extractionBlock = `
Structured extraction from chief complaint:
  Primary symptom : ${extractedSymptoms.primarySymptom}
  Body system     : ${extractedSymptoms.bodySystem}
  Duration        : ${extractedSymptoms.duration ?? "unknown"}
  Severity        : ${extractedSymptoms.severity ?? "unknown"}
  Onset           : ${extractedSymptoms.onset ?? "unknown"}
  Covered dims    : ${covered}
  Missing dims    : ${missing}${hasFlags ? `\n  ⚠ Red flags     : ${extractedSymptoms.redFlagLanguage.join(", ")}` : ""}
`;
  }

  // ── Conversation history ─────────────────────────────────────
  const history =
    answeredQuestions.length > 0
      ? answeredQuestions
          .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
          .join("\n\n")
      : "No follow-up questions answered yet.";

  return `Patient: ${patientLine || "Not provided"}

Chief Complaint:
"${chiefComplaint}"
${extractionBlock}
Conversation so far (${answeredQuestions.length}/8 questions answered):
${history}

Task: Generate the single most important next clarifying question.
- Prioritise dimensions still missing from the extraction above.
- If this is question 8 or you have sufficient data, set isLastQuestion to true.
- Choose the inputType that best fits the question (see rules).

Respond with ONLY valid JSON.`;
}

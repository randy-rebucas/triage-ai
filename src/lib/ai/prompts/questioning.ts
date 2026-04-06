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

  const complaintFocusBlock = buildComplaintFocusBlock(extractedSymptoms, coveredByHistory);

  return `Patient: ${patientLine || "Not provided"}

Chief Complaint:
"${chiefComplaint}"
${extractionBlock}${complaintFocusBlock}
━━━ DIMENSION TRACKING ━━━
Already covered (DO NOT ask about these again): ${coveredByHistory.length ? coveredByHistory.join(", ") : "none"}
Still missing (prioritise in this order): ${missing.length ? missing.join(", ") : "all covered — use clinical judgment"}

Conversation so far (${answeredQuestions.length}/8 questions answered):
${history}

Task: Generate question ${nextNumber} — the single most important MISSING clarifying question.
CRITICAL: You MUST NOT ask about any dimension already listed as "covered" above.
- Follow the complaint-specific priority order above (if present) when choosing the next dimension.
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

${QUESTION_RULES}

━━━ COMPLAINT-ADAPTIVE BEHAVIOUR ━━━
- When a "COMPLAINT-SPECIFIC CLINICAL FOCUS" block is provided, you MUST follow its priority order
  to decide which dimension to ask about next.
- Tailor question wording to the specific complaint (e.g. for chest pain ask about radiation to arm/jaw,
  for headache ask about thunderclap onset, for abdominal pain ask about location first).
- Never ask a generic question when a complaint-specific one is clinically more valuable.

━━━ FEW-SHOT EXAMPLES ━━━

Example A — cardiovascular complaint, Q1 (severity first per cardiac focus):
On a scale of 0 to 10, how would you rate the chest pain right now?
---
{"questionId":"q_1","inputType":"slider","category":"severity","isLastQuestion":false,"progress":12}

Example B — neurological complaint, Q1 (onset first per neurological focus):
Did your headache come on suddenly like a thunderclap, or did it build up gradually?
---
{"questionId":"q_1","inputType":"text","category":"onset","isLastQuestion":false,"progress":12}

Example C — gastrointestinal complaint, Q2 (location first per GI focus):
Where exactly do you feel the stomach pain — is it in one specific spot or spread across your whole belly?
---
{"questionId":"q_2","inputType":"text","category":"location","isLastQuestion":false,"progress":25}

Example D — radiation question for cardiac complaint:
Does the pain spread to your arm, jaw, or shoulder?
---
{"questionId":"q_3","inputType":"yes_no","category":"radiation","isLastQuestion":false,"progress":38}

Example E — final question:
Are you currently taking any medications, including over-the-counter drugs or supplements?
---
{"questionId":"q_8","inputType":"yes_no","category":"history","isLastQuestion":true,"progress":100}

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

// ─── Dimension keywords used to infer which clinical dimensions an
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

// ─── Complaint-specific dimension priority by body system ─────────
// When the extracted body system is known, override the default
// dimension ordering with one tuned to the clinical complaint type.
// Keys match the bodySystem values produced by symptomExtraction.
const COMPLAINT_FOCUS: Record<string, { priorityDims: string[]; clinicalNote: string }> = {
  cardiovascular: {
    priorityDims: ["severity", "radiation", "associated", "onset", "aggravating", "history"],
    clinicalNote:
      "Cardiac complaint — prioritise severity (0–10 scale), radiation to arm/jaw/shoulder, " +
      "associated symptoms (sweating, breathlessness, nausea), then history of heart disease.",
  },
  respiratory: {
    priorityDims: ["severity", "onset", "associated", "aggravating", "character", "history"],
    clinicalNote:
      "Respiratory complaint — prioritise severity, onset (sudden vs gradual), " +
      "associated symptoms (fever, productive cough, haemoptysis), triggers, and history of asthma/COPD.",
  },
  neurological: {
    priorityDims: ["onset", "severity", "location", "associated", "character", "history"],
    clinicalNote:
      "Neurological complaint — prioritise onset (thunderclap = critical), severity, " +
      "location (unilateral vs bilateral), associated symptoms (visual changes, weakness, slurred speech), " +
      "and history of migraines or prior episodes.",
  },
  gastrointestinal: {
    priorityDims: ["location", "character", "onset", "aggravating", "associated", "history"],
    clinicalNote:
      "GI complaint — prioritise specific location, character (cramping vs constant), " +
      "onset, aggravating factors (meals, position), associated symptoms (vomiting, rectal bleeding, fever).",
  },
  musculoskeletal: {
    priorityDims: ["location", "onset", "severity", "character", "aggravating", "relieving"],
    clinicalNote:
      "MSK complaint — prioritise exact location, mechanism of onset (trauma vs spontaneous), " +
      "severity, character (sharp vs dull), and what aggravates or relieves it.",
  },
  genitourinary: {
    priorityDims: ["location", "character", "associated", "onset", "history"],
    clinicalNote:
      "GU complaint — prioritise location, character (burning, pressure, colicky), " +
      "associated symptoms (haematuria, discharge, fever), and relevant past history.",
  },
  dermatological: {
    priorityDims: ["location", "onset", "character", "associated", "aggravating", "history"],
    clinicalNote:
      "Dermatological complaint — prioritise location/distribution, onset, character (rash type, " +
      "itch, pain), associated systemic symptoms, and history of skin conditions or allergies.",
  },
  psychiatric: {
    priorityDims: ["onset", "severity", "history", "associated", "aggravating"],
    clinicalNote:
      "Psychiatric/mental-health complaint — prioritise onset, severity of functional impairment, " +
      "history of prior episodes or diagnoses, associated somatic symptoms, and any safety concerns.",
  },
  endocrine: {
    priorityDims: ["onset", "duration", "associated", "severity", "history"],
    clinicalNote:
      "Endocrine complaint — prioritise onset, duration, associated symptoms (polyuria, polydipsia, " +
      "weight change, heat/cold intolerance), and history of diabetes or thyroid disease.",
  },
  general: {
    priorityDims: ["onset", "duration", "severity", "associated", "history"],
    clinicalNote:
      "General/systemic complaint — cover onset, duration, severity, associated symptoms, " +
      "and relevant medical history.",
  },
};

/**
 * Build a complaint-specific clinical focus block for the AI prompt.
 * Returns an empty string when no body-system context is available.
 */
function buildComplaintFocusBlock(
  extractedSymptoms: SymptomExtractionResult | undefined,
  coveredDimensions: string[]
): string {
  if (!extractedSymptoms?.bodySystem) return "";

  const focus =
    COMPLAINT_FOCUS[extractedSymptoms.bodySystem] ?? COMPLAINT_FOCUS["general"];

  const remainingPriority = focus.priorityDims.filter(
    (d) => !coveredDimensions.includes(d)
  );
  if (remainingPriority.length === 0) return "";

  return `
━━━ COMPLAINT-SPECIFIC CLINICAL FOCUS ━━━
Body system  : ${extractedSymptoms.bodySystem}
Clinical note: ${focus.clinicalNote}
Priority order for remaining dimensions: ${remainingPriority.join(" → ")}
You MUST follow this priority order when picking the next question.`;
}

/**
 * Infer which clinical dimensions are covered by a set of Q&A pairs.
 * Scans both question text AND answer text — if a patient volunteered
 * duration info in their answer to a different question, that dimension
 * is still considered covered and should not be asked again.
 */
function inferCoveredDimensions(
  answeredQuestions: { question: string; answer: string }[],
  extractionCovered: string[] = []
): string[] {
  const covered = new Set(extractionCovered);
  for (const { question, answer } of answeredQuestions) {
    const q = question.toLowerCase();
    const a = answer.toLowerCase();
    for (const [dim, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
      if (keywords.some((kw) => q.includes(kw) || a.includes(kw))) {
        covered.add(dim);
      }
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
  const complaintFocusBlock = buildComplaintFocusBlock(extractedSymptoms, coveredByHistory);

  return `Patient: ${patientLine || "Not provided"}
Chief Complaint: "${chiefComplaint}"
${extractionBlock}${complaintFocusBlock}
━━━ DIMENSION TRACKING ━━━
Already covered (DO NOT ask about these again): ${coveredByHistory.length ? coveredByHistory.join(", ") : "none"}
Still missing (prioritise in this order): ${missing.length ? missing.join(", ") : "all covered — use clinical judgment"}

━━━ CONVERSATION HISTORY (${answeredQuestions.length}/8 answered) ━━━
${history}

Generate question ${nextNumber}.
CRITICAL: You MUST NOT ask about any dimension already listed as "covered" above.
Follow the complaint-specific priority order (if present above) to pick the next dimension.
Pick the single most important MISSING dimension.
${answeredQuestions.length >= 7 ? "This MUST be the last question — set isLastQuestion: true." : ""}

Output format: question text, then ---, then JSON metadata.`;
}

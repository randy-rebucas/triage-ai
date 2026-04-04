// ─────────────────────────────────────────────────────────────────
// AI Prompt: Adaptive Questioning
// Generates the next clarifying question based on conversation
// history. Focuses on extracting clinically relevant symptom data.
// ─────────────────────────────────────────────────────────────────

export interface QuestioningContext {
  chiefComplaint: string;
  answeredQuestions: {
    question: string;
    answer: string;
  }[];
  patientAge?: number;
  patientGender?: string;
}

export interface NextQuestionResult {
  questionId: string;
  question: string;
  isLastQuestion: boolean;
  progress: number;
}

export function buildQuestioningSystemPrompt(): string {
  return `You are a medical triage assistant helping gather patient symptoms before a doctor review.

Your role is to ask clear, non-technical questions to understand the patient's condition.
You are NOT a doctor and must NOT provide diagnoses or medical advice.

CRITICAL RULES:
- Ask one question at a time
- Keep language simple and non-medical (patient-facing)
- Cover key clinical dimensions: onset, duration, severity, character, location, radiation, aggravating/relieving factors, associated symptoms
- Always check for red-flag symptoms (chest pain, breathing difficulty, severe headache, loss of consciousness, bleeding)
- Stop after 8 questions maximum OR earlier if enough data is gathered
- ALWAYS output valid JSON only — no extra text

OUTPUT FORMAT (strict JSON):
{
  "questionId": "q_<number>",
  "question": "Simple, clear question for the patient",
  "isLastQuestion": false,
  "progress": 50
}

Where:
- questionId: unique ID like q_1, q_2, etc.
- question: the actual question text (plain language, empathetic)
- isLastQuestion: true if this should be the final question
- progress: estimated % complete (0-100)`;
}

export function buildQuestioningUserPrompt(
  context: QuestioningContext
): string {
  const { chiefComplaint, answeredQuestions, patientAge, patientGender } =
    context;

  const conversationHistory =
    answeredQuestions.length > 0
      ? answeredQuestions
          .map(
            (qa, i) =>
              `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`
          )
          .join("\n\n")
      : "No questions answered yet.";

  const patientContext = [
    patientAge ? `Age: ${patientAge}` : null,
    patientGender ? `Gender: ${patientGender}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `Patient Information:
${patientContext || "Not provided"}

Chief Complaint:
"${chiefComplaint}"

Conversation History:
${conversationHistory}

Questions answered so far: ${answeredQuestions.length}/8 maximum

Based on this information, generate the next most important clarifying question.
If you have sufficient information (typically after 5-8 questions), set isLastQuestion to true.
Always set isLastQuestion to true if this is question 8 or beyond.

Respond with ONLY valid JSON.`;
}

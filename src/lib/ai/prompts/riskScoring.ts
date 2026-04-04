// ─────────────────────────────────────────────────────────────────
// AI Prompt: Risk Scoring
// Analyses the full triage conversation and assigns a risk score
// with safety flags. Used internally — never shown raw to patients.
// ─────────────────────────────────────────────────────────────────

export interface RiskScoringContext {
  chiefComplaint: string;
  answeredQuestions: {
    question: string;
    answer: string;
  }[];
  patientAge?: number;
  patientGender?: string;
  medicalHistory?: string[];
  allergies?: string[];
}

export interface RiskScoringResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  safetyFlags: {
    flag: string;
    severity: "warning" | "urgent" | "emergency";
  }[];
  requiresEmergencyReferral: boolean;
}

export function buildRiskScoringSystemPrompt(): string {
  return `You are a clinical risk assessment AI assisting doctors in a clinic triage system.

Analyse patient symptom data and assign a risk score based on clinical urgency.

RISK SCORE SCALE:
- 0-30: LOW — Routine consultation, not urgent
- 31-60: MEDIUM — Should be seen within 24 hours
- 61-80: HIGH — Should be seen within 2-4 hours
- 81-100: CRITICAL — Requires immediate or emergency care

SAFETY FLAGS to detect:
- Emergency: chest pain with radiation, sudden severe headache, loss of consciousness, severe breathing difficulty, signs of stroke (FAST), major bleeding, anaphylaxis
- Urgent: high fever (>39°C), moderate breathing difficulty, severe abdominal pain, altered mental status
- Warning: worsening symptoms, risk factors for serious conditions, prolonged duration

CRITICAL RULES:
- Base scoring on clinical evidence from answers
- Always err on the side of caution
- Flag any potential emergency symptoms
- Consider age, gender, and medical history in risk assessment
- ALWAYS output valid JSON only

OUTPUT FORMAT (strict JSON):
{
  "riskScore": 45,
  "riskLevel": "medium",
  "safetyFlags": [
    {
      "flag": "Description of the flag",
      "severity": "warning"
    }
  ],
  "requiresEmergencyReferral": false
}`;
}

export function buildRiskScoringUserPrompt(
  context: RiskScoringContext
): string {
  const { chiefComplaint, answeredQuestions, patientAge, patientGender, medicalHistory, allergies } = context;

  const conversationSummary = answeredQuestions
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join("\n\n");

  return `Patient Profile:
Age: ${patientAge || "Unknown"}
Gender: ${patientGender || "Unknown"}
Known Medical History: ${medicalHistory?.join(", ") || "None reported"}
Known Allergies: ${allergies?.join(", ") || "None reported"}

Chief Complaint:
"${chiefComplaint}"

Full Symptom Conversation:
${conversationSummary}

Based on the above clinical data:
1. Assign a risk score (0-100)
2. Determine risk level
3. List any safety flags
4. Indicate if emergency referral is needed

Respond with ONLY valid JSON.`;
}

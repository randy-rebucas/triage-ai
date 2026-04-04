// ─────────────────────────────────────────────────────────────────
// AI Prompt: Report Generation
// Generates the structured triage report with possible conditions,
// recommendations, and summary. This goes to BOTH doctor and patient
// but with different views — patients NEVER see diagnosis labels.
// ─────────────────────────────────────────────────────────────────

export interface ReportContext {
  chiefComplaint: string;
  answeredQuestions: {
    question: string;
    answer: string;
  }[];
  riskScore: number;
  riskLevel: string;
  safetyFlags: {
    flag: string;
    severity: string;
  }[];
  patientAge?: number;
  patientGender?: string;
  medicalHistory?: string[];
  allergies?: string[];
}

export interface ReportResult {
  possibleConditions: {
    name: string;
    icd10Code: string;
    likelihood: "low" | "moderate" | "high";
    description: string;
  }[];
  aiSummary: string;
  recommendations: string[];
  disclaimer: string;
}

export function buildReportSystemPrompt(): string {
  return `You are an AI clinical triage assistant generating a pre-consultation report for doctor review.

CRITICAL MEDICAL-LEGAL RULES:
1. NEVER provide a definitive diagnosis — only "possible conditions"
2. Always use hedging language: "may suggest", "could indicate", "possible", "warrants evaluation"
3. Always include the medical disclaimer
4. List ICD-10 codes accurately for doctor reference
5. Recommendations must be safe and conservative
6. If any emergency flags exist, make them the FIRST recommendation
7. This report is for DOCTOR REVIEW — the patient sees a simplified version

POSSIBLE CONDITIONS FORMAT:
- Include 2-5 possible conditions in order of likelihood
- Use correct ICD-10 codes
- Likelihood: "low" | "moderate" | "high"
- Brief non-alarming description

RECOMMENDATIONS must:
- Be actionable
- Start with most urgent items
- Include "Consult your doctor" for anything beyond first aid
- Never recommend specific medications by name

ALWAYS output valid JSON only.

OUTPUT FORMAT:
{
  "possibleConditions": [
    {
      "name": "Condition name",
      "icd10Code": "X00.0",
      "likelihood": "high",
      "description": "Brief clinical description"
    }
  ],
  "aiSummary": "Clinical summary paragraph for doctor review",
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ],
  "disclaimer": "This AI-generated report is for clinical reference only and does not constitute a medical diagnosis. A licensed physician must review and validate all findings."
}`;
}

export function buildReportUserPrompt(context: ReportContext): string {
  const {
    chiefComplaint,
    answeredQuestions,
    riskScore,
    riskLevel,
    safetyFlags,
    patientAge,
    patientGender,
    medicalHistory,
    allergies,
  } = context;

  const conversationSummary = answeredQuestions
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join("\n\n");

  const flagsText =
    safetyFlags.length > 0
      ? safetyFlags.map((f) => `[${f.severity.toUpperCase()}] ${f.flag}`).join("\n")
      : "No safety flags identified";

  return `Generate a clinical triage report based on the following data:

PATIENT PROFILE:
Age: ${patientAge || "Unknown"}
Gender: ${patientGender || "Unknown"}
Medical History: ${medicalHistory?.join(", ") || "None reported"}
Known Allergies: ${allergies?.join(", ") || "None reported"}

CHIEF COMPLAINT:
"${chiefComplaint}"

SYMPTOM CONVERSATION:
${conversationSummary}

AI RISK ASSESSMENT:
Risk Score: ${riskScore}/100
Risk Level: ${riskLevel.toUpperCase()}

SAFETY FLAGS:
${flagsText}

Generate a comprehensive triage report with:
1. 2-5 possible conditions with ICD-10 codes
2. Clinical summary for the reviewing doctor
3. Conservative patient recommendations
4. Standard medical disclaimer

IMPORTANT: 
- This report goes to a doctor for review BEFORE any patient-facing version
- Use proper clinical terminology in the summary
- Keep recommendations safe and non-specific regarding medication
- If risk is HIGH or CRITICAL, the first recommendation must address the urgency

Respond with ONLY valid JSON.`;
}

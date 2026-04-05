// ─────────────────────────────────────────────────────────────────
// AI Prompt: Report Generation
// Generates the structured triage report with possible conditions,
// recommendations, and a structured summary object.
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
  summary: {
    chiefComplaint: string;
    duration: string;
    severity: string;
    onset: string;
  };
  possibleConditions: {
    name: string;
    icd10Code: string;
    /** 0.0–1.0 AI confidence */
    confidence: number;
    likelihood: "low" | "moderate" | "high";
    description: string;
  }[];
  recommendations: string[];
  urgency: "low" | "medium" | "high" | "critical";
  disclaimer: string;
}

export function buildReportSystemPrompt(): string {
  return `You are an AI clinical triage assistant generating a pre-consultation report.

CRITICAL MEDICAL-LEGAL RULES:
1. NEVER provide a definitive diagnosis — only "possible conditions"
2. Always use hedging language: "may suggest", "could indicate", "possible", "warrants evaluation"
3. Always include the medical disclaimer
4. List ICD-10 codes accurately for clinician reference
5. Recommendations must be safe and conservative
6. If any emergency flags exist, make them the FIRST recommendation

SUMMARY OBJECT — extract from conversation:
- chiefComplaint : normalised, concise restatement (1–2 sentences)
- duration       : how long symptoms have been present ("2 hours", "3 days", "unknown")
- severity       : self-reported severity ("8/10", "moderate", "mild", "unknown")
- onset          : how symptoms started ("sudden", "gradual", "unknown")

POSSIBLE CONDITIONS FORMAT:
- 2–5 conditions in order of likelihood
- Correct ICD-10 codes
- confidence: decimal 0.0–1.0 (e.g. 0.75)
- likelihood: "low" | "moderate" | "high"

URGENCY maps to overall risk: "low" | "medium" | "high" | "critical"

ALWAYS output valid JSON only.

OUTPUT FORMAT:
{
  "summary": {
    "chiefComplaint": "Patient reports...",
    "duration": "2 hours",
    "severity": "8/10",
    "onset": "sudden"
  },
  "possibleConditions": [
    {
      "name": "Condition name",
      "icd10Code": "X00.0",
      "confidence": 0.75,
      "likelihood": "high",
      "description": "Brief clinical description"
    }
  ],
  "recommendations": [
    "Actionable recommendation 1"
  ],
  "urgency": "high",
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
1. A structured summary object (chiefComplaint, duration, severity, onset — extracted from the conversation)
2. 2–5 possible conditions with ICD-10 codes and 0.0–1.0 confidence scores
3. Conservative patient recommendations (start with most urgent)
4. Urgency level matching the risk level
5. Standard medical disclaimer

IMPORTANT:
- If risk is HIGH or CRITICAL, the first recommendation must address urgency
- Keep recommendations safe and non-specific regarding medication
- confidence values must be numbers between 0.0 and 1.0

Respond with ONLY valid JSON.`;
}

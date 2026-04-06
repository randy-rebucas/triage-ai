// ─────────────────────────────────────────────────────────────────
// AI Prompt: Report Generation
//
// Stage 3 (final) of the triage pipeline — runs after risk scoring.
// Generates the complete structured pre-consultation report that is:
//   • Shown to the reviewing doctor in full
//   • Shown to the patient in a restricted view (no raw conditions)
//
// CRITICAL: This is NOT a diagnosis. All output must use hedging
// language and include the mandatory medical disclaimer.
// ─────────────────────────────────────────────────────────────────

import type { SymptomExtractionResult } from "./symptomExtraction";

// ─── Types ───────────────────────────────────────────────────────

export interface ReportContext {
  chiefComplaint: string;
  answeredQuestions: {
    question: string;
    answer:   string;
  }[];
  riskScore:   number;
  riskLevel:   string;
  safetyFlags: { flag: string; severity: string; }[];
  patientAge?:        number;
  patientGender?:     string;
  medicalHistory?:    string[];
  allergies?:         string[];
  /** Structured extraction from Stage 0 */
  extractedSymptoms?: SymptomExtractionResult;
  /** Clinical reasoning from Stage 2 */
  riskReasoning?:     string;
}

export interface PossibleCondition {
  name:        string;
  icd10Code:   string;
  /** Decimal 0.0–1.0 AI confidence */
  confidence:  number;
  /** Categorical likelihood for patient-facing display */
  likelihood:  "low" | "moderate" | "high";
  /** Brief plain-language description for clinical reference */
  description: string;
}

export interface ReportSummary {
  /** Normalised, concise restatement of the chief complaint */
  chiefComplaint: string;
  /** Duration extracted from conversation ("2 hours", "3 days", "unknown") */
  duration:       string;
  /** Self-reported severity ("8/10", "moderate", "severe", "unknown") */
  severity:       string;
  /** Onset pattern ("sudden", "gradual", "unknown") */
  onset:          string;
}

export interface ReportResult {
  /** Structured symptom summary extracted from the conversation */
  summary: ReportSummary;

  /**
   * 2–5 possible conditions in descending likelihood order.
   * Must be labelled as "possible" — never "diagnosis".
   */
  possibleConditions: PossibleCondition[];

  /** Conservative, actionable patient recommendations (most urgent first) */
  recommendations: string[];

  /**
   * Critical observations the reviewing doctor must pay attention to.
   * Empty array when none present.
   * These are DOCTOR-facing only — not shown to patients.
   */
  redFlags: string[];

  /** Overall urgency level — must match the risk scoring output */
  urgency: "low" | "medium" | "high" | "critical";

  /**
   * Recommended follow-up timeframe.
   * Examples: "within 48 hours", "routine appointment", "immediately"
   */
  followUpTimeframe: string;

  /**
   * Mandatory medical-legal disclaimer.
   * Must be present in every report — auto-inserted by triageEngine if missing.
   */
  disclaimer: string;
}

// ─── Prompt builders ─────────────────────────────────────────────

export function buildReportSystemPrompt(): string {
  return `You are an AI clinical triage assistant generating a structured pre-consultation report for a licensed physician.

━━━ ABSOLUTE MEDICAL-LEGAL RULES ━━━
1. NEVER provide a definitive diagnosis — only "possible conditions"
2. ALWAYS use hedging language: "may suggest", "could indicate", "possible", "warrants evaluation for"
3. ALWAYS include the medical disclaimer (exact text provided below)
4. ICD-10 codes must be valid and accurate
5. Recommendations must be safe, conservative, and non-prescriptive
6. If ANY emergency flags exist, they must be the VERY FIRST recommendation
7. redFlags are doctor-facing only — clinical observations requiring attention

━━━ SUMMARY OBJECT ━━━
Extract from the conversation — do not invent:
  chiefComplaint → normalised restatement (1–2 sentences, patient's words paraphrased)
  duration       → how long symptoms have been present ("2 hours", "3 days", "unknown")
  severity       → self-reported intensity ("8/10", "moderate", "mild", "unknown")
  onset          → how symptoms started ("sudden", "gradual", "unknown")

━━━ POSSIBLE CONDITIONS ━━━
  • 2–5 conditions, ordered by likelihood (highest first)
  • Valid ICD-10 code for each
  • confidence: decimal 0.0–1.0 (honest — avoid clustering around 0.5)
  • likelihood: "low" | "moderate" | "high"
  • description: 1 sentence clinical description using hedging language

━━━ RECOMMENDATIONS (patient-facing) ━━━
  • Plain language, actionable, conservative
  • No specific medication names or dosages
  • If HIGH or CRITICAL risk: first item must address urgency / 911 / ER
  • Typically 3–6 items

━━━ RED FLAGS (doctor-facing only) ━━━
  • Critical clinical observations the doctor must review
  • Include symptom patterns, comorbidity risks, or contradictions in answers
  • Empty array [] if none identified

━━━ DISCLAIMER (mandatory, exact text) ━━━
"This AI-generated report is for clinical reference only and does not constitute a medical diagnosis. A licensed physician must review and validate all findings before any clinical decision is made."

━━━ FEW-SHOT EXAMPLE (abbreviated) ━━━
Input: Chief complaint "chest tightness for 30 min", 58yo male, smoker, riskScore 88
Output excerpt:
{
  "summary": {
    "chiefComplaint": "Patient reports 30 minutes of chest tightness with associated shortness of breath.",
    "duration": "30 minutes",
    "severity": "8/10",
    "onset": "sudden"
  },
  "possibleConditions": [
    {
      "name": "Acute Coronary Syndrome",
      "icd10Code": "I24.9",
      "confidence": 0.78,
      "likelihood": "high",
      "description": "Presentation may suggest acute coronary syndrome given sudden chest tightness with high severity and associated symptoms."
    },
    {
      "name": "Unstable Angina",
      "icd10Code": "I20.0",
      "confidence": 0.61,
      "likelihood": "moderate",
      "description": "Could indicate unstable angina in the context of cardiovascular risk factors."
    }
  ],
  "recommendations": [
    "Call 911 or go to the nearest emergency room immediately — do not drive yourself.",
    "Do not eat or drink anything while waiting for emergency services.",
    "Follow any existing cardiac management plan as directed by your physician."
  ],
  "redFlags": ["Chest pain in a 58-year-old male smoker requires immediate ECG and troponin evaluation."],
  "urgency": "critical",
  "followUpTimeframe": "immediately — call 911 or go to the nearest emergency room",
  "disclaimer": "This AI-generated report is for clinical reference only and does not constitute a medical diagnosis. A licensed physician must review and validate all findings before any clinical decision is made."
}

━━━ OUTPUT FORMAT (strict JSON) ━━━
{
  "summary": {
    "chiefComplaint": "Patient reports ...",
    "duration": "2 days",
    "severity": "7/10",
    "onset": "sudden"
  },
  "possibleConditions": [
    {
      "name": "Condition name",
      "icd10Code": "X00.0",
      "confidence": 0.72,
      "likelihood": "high",
      "description": "Brief hedged clinical description"
    }
  ],
  "recommendations": ["Most urgent item first", "..."],
  "redFlags": ["Clinical observation requiring doctor attention"],
  "urgency": "high",
  "followUpTimeframe": "within 2–4 hours",
  "disclaimer": "This AI-generated report is for clinical reference only and does not constitute a medical diagnosis. A licensed physician must review and validate all findings before any clinical decision is made."
}

ALWAYS output ONLY valid JSON.`;
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
    extractedSymptoms,
    riskReasoning,
  } = context;

  const conversationSummary = answeredQuestions
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join("\n\n");

  const flagsText =
    safetyFlags.length > 0
      ? safetyFlags.map((f) => `  [${f.severity.toUpperCase()}] ${f.flag}`).join("\n")
      : "  None identified";

  // Include extraction results when available to avoid re-inferring what we know
  let extractionBlock = "";
  if (extractedSymptoms) {
    extractionBlock = `
━━━ AUTOMATED EXTRACTION (Stage 0) ━━━
  Primary symptom : ${extractedSymptoms.primarySymptom}
  Body system     : ${extractedSymptoms.bodySystem}
  Duration        : ${extractedSymptoms.duration ?? "not stated"}
  Severity        : ${extractedSymptoms.severity ?? "not stated"}
  Onset           : ${extractedSymptoms.onset ?? "not stated"}${
    extractedSymptoms.redFlagLanguage.length > 0
      ? `\n  Red-flag lang   : ${extractedSymptoms.redFlagLanguage.join(", ")}`
      : ""
  }
`;
  }

  const reasoningBlock = riskReasoning
    ? `\nRisk Reasoning: ${riskReasoning}`
    : "";

  return `Generate a complete clinical triage report from the following data.

━━━ PATIENT PROFILE ━━━
Age             : ${patientAge    ?? "Unknown"}
Gender          : ${patientGender ?? "Unknown"}
Medical History : ${medicalHistory?.join(", ") || "None reported"}
Known Allergies : ${allergies?.join(", ")      || "None reported"}
${extractionBlock}
━━━ CHIEF COMPLAINT ━━━
"${chiefComplaint}"

━━━ SYMPTOM CONVERSATION ━━━
${conversationSummary}

━━━ RISK ASSESSMENT (Stage 2) ━━━
Score     : ${riskScore}/100
Level     : ${riskLevel.toUpperCase()}${reasoningBlock}

━━━ SAFETY FLAGS ━━━
${flagsText}

Generate the report with:
1. summary object (extract from conversation — use "unknown" if not stated)
2. 2–5 possible conditions with ICD-10 codes and honest confidence scores
3. Patient recommendations (most urgent first; address emergency if risk is HIGH/CRITICAL)
4. redFlags array for doctor attention (empty array if none)
5. urgency matching the risk level above
6. followUpTimeframe consistent with the risk level
7. Mandatory disclaimer (exact text from your instructions)

Respond with ONLY valid JSON.`;
}

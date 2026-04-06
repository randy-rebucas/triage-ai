// ─────────────────────────────────────────────────────────────────
// AI Prompt: Risk Scoring
//
// Stage 2 of the triage pipeline — runs once the Q&A is complete.
// Analyses the full conversation and assigns a numeric risk score,
// categorical risk level, safety flags, clinical reasoning, and a
// recommended timeframe for the patient to be seen.
//
// Used internally (doctor-facing only) — never shown raw to patients.
// ─────────────────────────────────────────────────────────────────

import type { SymptomExtractionResult } from "./symptomExtraction";

// ─── Types ───────────────────────────────────────────────────────

export interface RiskScoringContext {
  chiefComplaint: string;
  answeredQuestions: {
    question: string;
    answer:   string;
  }[];
  patientAge?:        number;
  patientGender?:     string;
  medicalHistory?:    string[];
  allergies?:         string[];
  /** Structured extraction from Stage 0 */
  extractedSymptoms?: SymptomExtractionResult;
}

export interface SafetyFlag {
  flag:     string;
  severity: "warning" | "urgent" | "emergency";
}

export interface RiskScoringResult {
  /**
   * Numeric risk score 0–100.
   * Clamped and re-validated in triageEngine to match riskLevel thresholds.
   */
  riskScore: number;

  /** Categorical risk level derived from riskScore */
  riskLevel: "low" | "medium" | "high" | "critical";

  /** Detected safety flags with severity classification */
  safetyFlags: SafetyFlag[];

  /** Whether the patient requires emergency services immediately */
  requiresEmergencyReferral: boolean;

  /**
   * 1–2 sentence clinical rationale for the assigned score.
   * Surfaced to the reviewing doctor — must be objective and evidence-based.
   */
  reasoning: string;

  /**
   * Recommended timeframe for the patient to be seen.
   * Maps loosely to riskLevel:
   *   low      → "routine appointment within 1–2 weeks"
   *   medium   → "within 24–48 hours"
   *   high     → "within 2–4 hours"
   *   critical → "immediately — call 911 or go to the nearest ER"
   */
  recommendedTimeframe: string;
}

// ─── Prompt builders ─────────────────────────────────────────────

export function buildRiskScoringSystemPrompt(): string {
  return `You are a clinical risk assessment AI supporting a medical triage system.
Your output is reviewed by licensed physicians — never shown directly to patients.
Analyse the patient's symptom data and assign a risk score with full clinical justification.

━━━ RISK SCORE SCALE (0–100) ━━━
  0 –30   LOW      → Routine care; no clinical urgency
  31–60   MEDIUM   → Should be seen within 24–48 hours
  61–80   HIGH     → Should be seen within 2–4 hours
  81–100  CRITICAL → Requires immediate or emergency care

Always err on the side of caution. A missed high-risk case is far worse than an over-triage.

━━━ SAFETY FLAG DETECTION ━━━
emergency:
  • Chest pain with radiation to arm/jaw/shoulder
  • Sudden severe headache ("worst of my life")
  • Difficulty breathing / unable to breathe
  • Loss of consciousness / unresponsive
  • Signs of stroke: facial drooping, arm weakness, slurred speech
  • Severe / uncontrolled bleeding
  • Anaphylaxis / throat closing
  • Suicidal ideation or self-harm
  • Possible overdose

urgent:
  • High fever > 39°C / 102.2°F
  • Moderate breathing difficulty
  • Severe abdominal pain
  • Altered or confused mental state
  • Rapid worsening of symptoms

warning:
  • Symptoms present > 72 hours without improvement
  • Multiple concurrent symptoms
  • High-risk demographics (elderly, immunocompromised, pregnant)
  • Known relevant comorbidities (diabetes, cardiovascular disease)
  • Allergies relevant to presenting symptoms

━━━ SCORING FACTORS ━━━
Increase score for: emergency or urgent flags, severe self-reported intensity, sudden onset,
radiation of pain, age extremes (< 5 or > 65), relevant comorbidities, rapidly worsening symptoms.

Decrease score for: mild self-reported severity, gradual onset, improving trajectory,
young healthy patient, isolated minor symptom.

━━━ CRITICAL RULES ━━━
- Base score ONLY on clinical evidence in the conversation — never speculate
- reasoning must be objective, factual, ≤ 2 sentences, no diagnoses
- If ANY emergency flag is present, riskScore must be ≥ 82 (critical)
- ALWAYS output valid JSON only

━━━ FEW-SHOT EXAMPLES ━━━

Example A — Low risk (minor URI, young adult, mild symptoms):
{
  "riskScore": 18,
  "riskLevel": "low",
  "safetyFlags": [],
  "requiresEmergencyReferral": false,
  "reasoning": "Patient is a young adult with a 2-day mild sore throat and low-grade fever. No red-flag features and no concerning comorbidities.",
  "recommendedTimeframe": "routine appointment within 1–2 weeks"
}

Example B — Medium risk (abdominal pain, fever, 3 days):
{
  "riskScore": 48,
  "riskLevel": "medium",
  "safetyFlags": [
    { "flag": "Symptoms present for 3 days without improvement", "severity": "warning" },
    { "flag": "Fever accompanying abdominal pain", "severity": "warning" }
  ],
  "requiresEmergencyReferral": false,
  "reasoning": "Patient reports 3-day abdominal pain with low-grade fever and no peritoneal signs reported. Duration without improvement warrants timely evaluation.",
  "recommendedTimeframe": "within 24–48 hours"
}

Example C — Critical (chest pain radiating to left arm, sweating):
{
  "riskScore": 91,
  "riskLevel": "critical",
  "safetyFlags": [
    { "flag": "Chest pain with radiation to left arm — possible acute MI", "severity": "emergency" },
    { "flag": "Diaphoresis accompanying chest pain", "severity": "emergency" }
  ],
  "requiresEmergencyReferral": true,
  "reasoning": "High-severity chest pain with left arm radiation and diaphoresis in a patient requiring immediate evaluation. Multiple emergency-level safety flags present.",
  "recommendedTimeframe": "immediately — call 911 or go to the nearest emergency room"
}

━━━ OUTPUT FORMAT (strict JSON) ━━━
{
  "riskScore": 55,
  "riskLevel": "medium",
  "safetyFlags": [
    { "flag": "Symptom present for 5 days without improvement", "severity": "warning" }
  ],
  "requiresEmergencyReferral": false,
  "reasoning": "Patient reports moderate severity symptoms with a 5-day duration and no red-flag features. Age and comorbidities are not concerning.",
  "recommendedTimeframe": "within 24–48 hours"
}`;
}

export function buildRiskScoringUserPrompt(
  context: RiskScoringContext
): string {
  const {
    chiefComplaint,
    answeredQuestions,
    patientAge,
    patientGender,
    medicalHistory,
    allergies,
    extractedSymptoms,
  } = context;

  const conversationSummary = answeredQuestions
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join("\n\n");

  // Include extraction results if available for richer context
  let extractionBlock = "";
  if (extractedSymptoms) {
    const flags = extractedSymptoms.redFlagLanguage;
    extractionBlock = `
Automated Extraction Results:
  Primary symptom : ${extractedSymptoms.primarySymptom}
  Body system     : ${extractedSymptoms.bodySystem}
  Duration        : ${extractedSymptoms.duration ?? "not stated"}
  Severity        : ${extractedSymptoms.severity ?? "not stated"}
  Onset           : ${extractedSymptoms.onset ?? "not stated"}${flags.length > 0 ? `\n  Red-flag lang   : ${flags.join(", ")}` : ""}
`;
  }

  return `━━━ PATIENT PROFILE ━━━
Age             : ${patientAge    ?? "Unknown"}
Gender          : ${patientGender ?? "Unknown"}
Medical History : ${medicalHistory?.join(", ") || "None reported"}
Known Allergies : ${allergies?.join(", ")      || "None reported"}
${extractionBlock}
━━━ CHIEF COMPLAINT ━━━
"${chiefComplaint}"

━━━ FULL SYMPTOM CONVERSATION ━━━
${conversationSummary}

Based on all the above:
1. Assign a risk score (0–100)
2. Determine the risk level
3. List all applicable safety flags with severity
4. State whether emergency referral is required
5. Provide 1–2 sentence clinical reasoning for the score
6. State the recommended timeframe for the patient to be seen

Respond with ONLY valid JSON.`;
}

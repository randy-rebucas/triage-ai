// ─────────────────────────────────────────────────────────────────
// AI Prompt: Symptom Extraction
//
// Stage 0 of the triage pipeline — runs once on the chief complaint
// before any follow-up questions are asked.
//
// Parses the patient's free-text into a structured object so that:
//   • The adaptive questioning stage knows which clinical dimensions
//     are already covered and which need follow-up.
//   • Red-flag language triggers safety escalation immediately.
//   • Downstream risk scoring and report generation have richer context.
// ─────────────────────────────────────────────────────────────────

// ─── Clinical dimension taxonomy ─────────────────────────────────

export type ClinicalDimension =
  | "onset"        // How the symptom started (sudden / gradual)
  | "duration"     // How long it has been present
  | "severity"     // Self-reported intensity
  | "location"     // Body area or system affected
  | "character"    // Sensation type: sharp, dull, burning, pressure…
  | "radiation"    // Whether it spreads to other areas
  | "aggravating"  // What makes it worse
  | "relieving"    // What makes it better
  | "associated"   // Other co-occurring symptoms mentioned
  | "history";     // Past episodes or relevant medical context

export const ALL_DIMENSIONS: ClinicalDimension[] = [
  "onset", "duration", "severity", "location", "character",
  "radiation", "aggravating", "relieving", "associated", "history",
];

// ─── Types ───────────────────────────────────────────────────────

export interface SymptomExtractionContext {
  chiefComplaint: string;
  patientAge?:    number;
  patientGender?: string;
}

export interface ExtractedSymptom {
  /** Plain-language symptom name as the patient stated it */
  symptom:   string;
  /** Body location if mentioned */
  location?: string;
  /** Severity descriptor if mentioned */
  severity?: string;
  /** Duration if mentioned */
  duration?: string;
}

export interface SymptomExtractionResult {
  /** All individual symptoms identified in the complaint */
  symptoms: ExtractedSymptom[];

  /** The single most prominent presenting symptom */
  primarySymptom: string;

  /**
   * Duration extracted from the text.
   * null when not mentioned.
   */
  duration: string | null;

  /**
   * Severity extracted from the text ("severe", "8/10", "mild", …).
   * null when not mentioned.
   */
  severity: string | null;

  /**
   * Onset pattern extracted from the text ("sudden", "gradual", …).
   * null when not mentioned.
   */
  onset: string | null;

  /**
   * High-level body system affected.
   * One of: cardiovascular | respiratory | gastrointestinal | neurological |
   *         musculoskeletal | dermatological | urological | endocrine |
   *         psychiatric | ENT | ophthalmological | general
   */
  bodySystem: string;

  /**
   * Exact phrases from the complaint that match known red-flag patterns.
   * Empty array when none detected.
   */
  redFlagLanguage: string[];

  /** Which clinical dimensions were explicitly present in the complaint */
  coveredDimensions: ClinicalDimension[];

  /** Which clinical dimensions were absent and need follow-up questions */
  missingDimensions: ClinicalDimension[];
}

// ─── Prompt builders ─────────────────────────────────────────────

export function buildSymptomExtractionSystemPrompt(): string {
  return `You are a medical NLP triage system. Your job is to parse a patient's free-text chief complaint into a structured JSON object.

This output seeds the adaptive questioning stage — it tells the next AI exactly what is already known and what still needs clarification.

━━━ CLINICAL DIMENSIONS TO TRACK ━━━
For each dimension, mark it COVERED if the patient's text explicitly states it, or MISSING if it must be asked.

  onset        → "sudden", "gradual", "came on over a few hours", etc.
  duration     → "since yesterday", "for 3 days", "2 hours ago", etc.
  severity     → "8/10", "very painful", "mild", "severe", etc.
  location     → body part or region explicitly named
  character    → sensation type: sharp, dull, throbbing, burning, pressure, cramping, etc.
  radiation    → "spreads to", "goes down my arm", "radiates to", etc.
  aggravating  → "worse when", "gets worse with", etc.
  relieving    → "better when", "goes away if", etc.
  associated   → other symptoms mentioned alongside the main complaint
  history      → past episodes, known conditions, medications mentioned

━━━ RED-FLAG LANGUAGE TO DETECT ━━━
Extract the EXACT phrase from the patient's text if any of these are present:
  • "chest pain", "pressure in chest"
  • "difficulty breathing", "can't breathe", "shortness of breath"
  • "sudden severe headache", "worst headache of my life"
  • "loss of consciousness", "fainted", "passed out"
  • "stroke", "face drooping", "arm weakness", "slurred speech", "can't speak"
  • "severe bleeding", "uncontrolled bleeding"
  • "allergic reaction", "throat closing", "anaphylaxis"
  • "suicidal", "want to die", "kill myself"
  • "overdose", "took too many"

━━━ BODY SYSTEMS ━━━
Map to exactly one: cardiovascular | respiratory | gastrointestinal | neurological |
musculoskeletal | dermatological | urological | endocrine | psychiatric | ENT | ophthalmological | general

━━━ STRICT RULES ━━━
1. NEVER infer — only extract what is explicitly in the text
2. NEVER diagnose or interpret — report only what the patient said
3. If a dimension is not mentioned, its value is null
4. redFlagLanguage must be verbatim phrases, not paraphrases
5. Output ONLY valid JSON — no explanation, no markdown

OUTPUT FORMAT:
{
  "symptoms": [
    { "symptom": "chest pain", "location": "chest", "severity": null, "duration": null }
  ],
  "primarySymptom": "chest pain",
  "duration": null,
  "severity": null,
  "onset": null,
  "bodySystem": "cardiovascular",
  "redFlagLanguage": ["chest pain"],
  "coveredDimensions": ["location"],
  "missingDimensions": ["onset","duration","severity","character","radiation","aggravating","relieving","associated","history"]
}`;
}

export function buildSymptomExtractionUserPrompt(
  context: SymptomExtractionContext
): string {
  const { chiefComplaint, patientAge, patientGender } = context;

  const patientLine = [
    patientAge    ? `Age: ${patientAge}`       : null,
    patientGender ? `Gender: ${patientGender}` : null,
  ].filter(Boolean).join(" | ");

  return `Patient: ${patientLine || "Not provided"}

Chief complaint (patient's own words):
"${chiefComplaint}"

Extract all available symptom data.
Mark every clinical dimension as covered or missing.
List any exact red-flag phrases found in the text above.

Respond with ONLY valid JSON.`;
}

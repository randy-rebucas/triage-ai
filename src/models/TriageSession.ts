import mongoose, { Schema, Document, Types } from "mongoose";
import type { RiskLevel, TriageStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────
// TriageSession Model
//
// Records the full AI triage conversation, risk assessment, and
// structured AI report for a single patient symptom check.
//
// Schema shape matches the agreed MongoDB-friendly format:
//   - qaFlow      : the sequential Q&A exchange
//   - aiReport    : structured AI output (summary, conditions, recs)
//   - clinicalReview : optional clinician notes after validation
// ─────────────────────────────────────────────────────────────────

export interface IAiSummary {
  /** Normalised restatement of the chief complaint */
  chiefComplaint: string;
  /** Self-reported symptom duration, e.g. "2 hours", "3 days" */
  duration?: string;
  /** Self-reported severity, e.g. "8/10", "moderate" */
  severity?: string;
  /** Onset pattern, e.g. "sudden", "gradual" */
  onset?: string;
}

export interface IAiCondition {
  name: string;
  icd10Code: string;
  /** 0.0–1.0 AI confidence for this condition */
  confidence: number;
  /** Categorical likelihood for display */
  likelihood: "low" | "moderate" | "high";
  description: string;
}

export interface IAiReport {
  summary: IAiSummary;
  possibleConditions: IAiCondition[];
  recommendations: string[];
  /** Critical observations for the reviewing doctor */
  redFlags?: string[];
  /** Matches riskLevel — kept inside aiReport for the self-contained report view */
  urgency: RiskLevel;
  /** Recommended follow-up timeframe */
  followUpTimeframe?: string;
  disclaimer: string;
}

export interface IExtractedSymptomDocument {
  symptom:   string;
  location?: string;
  severity?: string;
  duration?: string;
}

export interface IExtractedSymptomsDocument {
  symptoms:          IExtractedSymptomDocument[];
  primarySymptom:    string;
  duration:          string | null;
  severity:          string | null;
  onset:             string | null;
  bodySystem:        string;
  redFlagLanguage:   string[];
  coveredDimensions: string[];
  missingDimensions: string[];
}

export interface IClinicalReview {
  reviewedBy: string;
  reviewedAt: Date;
  notes?: string;
  agreedWithAI: boolean;
}

export interface ITriageSessionDocument extends Document {
  tenantId:  string;
  patientId: Types.ObjectId;
  extractedSymptoms?: IExtractedSymptomsDocument;

  /** What the patient reported as the main concern */
  chiefComplaint: string;

  /** Sequential Q&A pairs — renamed from `questions` */
  qaFlow: {
    questionId: string;
    question: string;
    answer: string;
    answeredAt: Date;
  }[];

  currentQuestionIndex: number;
  totalQuestions: number;

  /** Keyword-detected safety flags raised during questioning */
  safetyFlags: {
    flag: string;
    severity: "warning" | "urgent" | "emergency";
  }[];

  /** Raw AI risk score (0–100) for sorting / filtering */
  riskScore: number;
  /** Categorical risk level */
  riskLevel: RiskLevel;

  /** Structured AI report — generated once Q&A is complete */
  aiReport?: IAiReport;

  status: TriageStatus;

  /** Populated when a clinician validates the session */
  clinicalReview?: IClinicalReview;

  createdAt: Date;
  updatedAt: Date;
}

const triageSessionSchema = new Schema<ITriageSessionDocument>(
  {
    tenantId: {
      type:     String,
      required: true,
      index:    true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "PatientAccount",
      required: true,
    },
    chiefComplaint: {
      type: String,
      required: [true, "Chief complaint is required"],
      trim: true,
      maxlength: [1000, "Chief complaint cannot exceed 1000 characters"],
    },
    qaFlow: [
      {
        questionId: { type: String, required: true },
        question: { type: String, required: true },
        answer: { type: String, required: true },
        answeredAt: { type: Date, default: Date.now },
      },
    ],
    currentQuestionIndex: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    safetyFlags: [
      {
        flag: { type: String },
        severity: {
          type: String,
          enum: ["warning", "urgent", "emergency"],
        },
      },
    ],
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    extractedSymptoms: {
      symptoms: [
        {
          symptom:  { type: String },
          location: { type: String },
          severity: { type: String },
          duration: { type: String },
        },
      ],
      primarySymptom:    { type: String },
      duration:          { type: String, default: null },
      severity:          { type: String, default: null },
      onset:             { type: String, default: null },
      bodySystem:        { type: String },
      redFlagLanguage:   { type: [String], default: [] },
      coveredDimensions: { type: [String], default: [] },
      missingDimensions: { type: [String], default: [] },
    },
    aiReport: {
      summary: {
        chiefComplaint: { type: String },
        duration:       { type: String },
        severity:       { type: String },
        onset:          { type: String },
      },
      possibleConditions: [
        {
          name:        { type: String },
          icd10Code:   { type: String },
          confidence:  { type: Number, min: 0, max: 1 },
          likelihood:  { type: String, enum: ["low", "moderate", "high"] },
          description: { type: String },
        },
      ],
      recommendations:   { type: [String], default: [] },
      redFlags:          { type: [String], default: [] },
      urgency: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
      },
      followUpTimeframe: { type: String },
      disclaimer:        { type: String },
    },
    status: {
      type: String,
      enum: ["in-progress", "pending_review", "reviewed", "archived"],
      default: "in-progress",
    },
    clinicalReview: {
      reviewedBy: { type: String },
      reviewedAt: { type: Date },
      notes: { type: String },
      agreedWithAI: { type: Boolean },
    },
  },
  {
    timestamps: true,
  }
);

// Composite indexes for common query patterns
triageSessionSchema.index({ tenantId: 1, status: 1, riskLevel: 1 });
triageSessionSchema.index({ tenantId: 1, patientId: 1, status: 1 });
triageSessionSchema.index({ createdAt: -1 });

const TriageSession =
  mongoose.models.TriageSession ||
  mongoose.model<ITriageSessionDocument>("TriageSession", triageSessionSchema);

export default TriageSession;

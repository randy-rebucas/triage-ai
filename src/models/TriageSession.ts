import mongoose, { Schema, Document, Types } from "mongoose";
import type { RiskLevel, TriageStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────
// TriageSession Model
// Records the full AI triage conversation, risk assessment, and
// doctor validation for a single patient visit.
// ─────────────────────────────────────────────────────────────────

export interface ITriageSessionDocument extends Document {
  tenantId: Types.ObjectId;
  patientId: Types.ObjectId;
  chiefComplaint: string;
  questions: {
    questionId: string;
    question: string;
    answer: string;
    answeredAt: Date;
  }[];
  currentQuestionIndex: number;
  totalQuestions: number;
  riskScore: number;
  riskLevel: RiskLevel;
  possibleConditions: {
    name: string;
    icd10Code: string;
    likelihood: "low" | "moderate" | "high";
    description: string;
  }[];
  aiSummary: string;
  recommendations: string[];
  safetyFlags: {
    flag: string;
    severity: "warning" | "urgent" | "emergency";
  }[];
  status: TriageStatus;
  doctorValidation?: {
    doctorId: Types.ObjectId;
    doctorName: string;
    validatedAt: Date;
    finalDiagnosis: string;
    icd10Code: string;
    notes: string;
    agreedWithAI: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const triageSessionSchema = new Schema<ITriageSessionDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    chiefComplaint: {
      type: String,
      required: [true, "Chief complaint is required"],
      trim: true,
      maxlength: [1000, "Chief complaint cannot exceed 1000 characters"],
    },
    questions: [
      {
        questionId: { type: String, required: true },
        question: { type: String, required: true },
        answer: { type: String, required: true },
        answeredAt: { type: Date, default: Date.now },
      },
    ],
    currentQuestionIndex: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
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
    possibleConditions: [
      {
        name: { type: String },
        icd10Code: { type: String },
        likelihood: {
          type: String,
          enum: ["low", "moderate", "high"],
        },
        description: { type: String },
      },
    ],
    aiSummary: {
      type: String,
      default: "",
    },
    recommendations: {
      type: [String],
      default: [],
    },
    safetyFlags: [
      {
        flag: { type: String },
        severity: {
          type: String,
          enum: ["warning", "urgent", "emergency"],
        },
      },
    ],
    status: {
      type: String,
      enum: ["in-progress", "completed", "validated", "archived"],
      default: "in-progress",
    },
    doctorValidation: {
      doctorId: { type: Schema.Types.ObjectId, ref: "User" },
      doctorName: { type: String },
      validatedAt: { type: Date },
      finalDiagnosis: { type: String },
      icd10Code: { type: String },
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
triageSessionSchema.index({ "doctorValidation.doctorId": 1 });

const TriageSession =
  mongoose.models.TriageSession ||
  mongoose.model<ITriageSessionDocument>("TriageSession", triageSessionSchema);

export default TriageSession;

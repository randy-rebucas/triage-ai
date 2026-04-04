import mongoose, { Schema, Document, Types } from "mongoose";
import type { RecordStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────
// ClinicalRecord Model
// Doctor-created record after a patient visit. Stores final
// diagnosis, prescriptions, vitals, and follow-up info.
// ─────────────────────────────────────────────────────────────────

export interface IClinicalRecordDocument extends Document {
  tenantId: Types.ObjectId;
  patientId: Types.ObjectId;
  triageSessionId?: Types.ObjectId;
  doctorId: Types.ObjectId;
  visitDate: Date;
  chiefComplaint: string;
  vitals?: {
    temperature?: number;
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
  };
  diagnosis: {
    name: string;
    icd10Code: string;
    notes: string;
  };
  prescriptions: {
    medication: string;
    dosage: string;
    frequency: string;
    duration: string;
    notes?: string;
  }[];
  notes: string;
  followUpDate?: Date;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
}

const clinicalRecordSchema = new Schema<IClinicalRecordDocument>(
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
    triageSessionId: {
      type: Schema.Types.ObjectId,
      ref: "TriageSession",
      default: null,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    visitDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    chiefComplaint: {
      type: String,
      required: [true, "Chief complaint is required"],
      trim: true,
    },
    vitals: {
      temperature: { type: Number, min: 30, max: 45 },
      bloodPressureSystolic: { type: Number, min: 50, max: 300 },
      bloodPressureDiastolic: { type: Number, min: 30, max: 200 },
      heartRate: { type: Number, min: 20, max: 300 },
      respiratoryRate: { type: Number, min: 4, max: 100 },
      oxygenSaturation: { type: Number, min: 50, max: 100 },
      weight: { type: Number, min: 0, max: 700 },
      height: { type: Number, min: 0, max: 300 },
    },
    diagnosis: {
      name: { type: String, required: true, trim: true },
      icd10Code: { type: String, required: true, trim: true, uppercase: true },
      notes: { type: String, default: "" },
    },
    prescriptions: [
      {
        medication: { type: String, required: true, trim: true },
        dosage: { type: String, required: true, trim: true },
        frequency: { type: String, required: true, trim: true },
        duration: { type: String, required: true, trim: true },
        notes: { type: String, default: "" },
      },
    ],
    notes: {
      type: String,
      default: "",
    },
    followUpDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "final"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

clinicalRecordSchema.index({ tenantId: 1, patientId: 1, visitDate: -1 });
clinicalRecordSchema.index({ tenantId: 1, doctorId: 1, visitDate: -1 });
clinicalRecordSchema.index({ triageSessionId: 1 });
clinicalRecordSchema.index({ status: 1 });

const ClinicalRecord =
  mongoose.models.ClinicalRecord ||
  mongoose.model<IClinicalRecordDocument>(
    "ClinicalRecord",
    clinicalRecordSchema
  );

export default ClinicalRecord;

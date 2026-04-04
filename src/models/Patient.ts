import mongoose, { Schema, Document, Types } from "mongoose";
import type { Gender } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Patient Model
// Stores patient's clinical profile, linked 1-to-1 with User
// ─────────────────────────────────────────────────────────────────

export interface IPatientDocument extends Document {
  userId: Types.ObjectId;
  /** Array — patient can belong to multiple clinics */
  tenantIds: Types.ObjectId[];
  dateOfBirth: Date;
  gender: Gender;
  contactNumber: string;
  address?: string;
  bloodType?: string;
  allergies: string[];
  medicalHistory: string[];
  emergencyContact?: {
    name: string;
    relationship: string;
    contactNumber: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const patientSchema = new Schema<IPatientDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    /**
     * Patients can belong to multiple clinics (tenants).
     * Use array-membership syntax: Patient.find({ tenantIds: tenantObjectId })
     */
    tenantIds: {
      type: [Schema.Types.ObjectId],
      ref: "Tenant",
      default: [],
    },
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      required: [true, "Gender is required"],
    },
    contactNumber: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    bloodType: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", null],
      default: null,
    },
    allergies: {
      type: [String],
      default: [],
    },
    medicalHistory: {
      type: [String],
      default: [],
    },
    emergencyContact: {
      name: { type: String, trim: true },
      relationship: { type: String, trim: true },
      contactNumber: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  }
);

// userId index is already created by unique: true above
// Index on tenantIds array for membership queries
patientSchema.index({ tenantIds: 1 });

const Patient =
  mongoose.models.Patient ||
  mongoose.model<IPatientDocument>("Patient", patientSchema);

export default Patient;

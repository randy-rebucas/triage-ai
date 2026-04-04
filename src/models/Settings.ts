import mongoose, { Schema, Document, Types } from "mongoose";

// ─────────────────────────────────────────────────────────────────
// Settings Model
// Per-tenant singleton. A unique sparse index on tenantId ensures
// each tenant has exactly one Settings document.
// ─────────────────────────────────────────────────────────────────

export interface ISettingsDocument extends Document {
  tenantId: Types.ObjectId;
  clinicName: string;
  clinicEmail?: string;
  clinicPhone?: string;
  clinicAddress?: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  language: "en" | "es";
  aiTriageEnabled: boolean;
  maxQuestionsPerSession: number;
  requireDoctorValidation: boolean;
  appointmentDurationMinutes: number;
  workingHours: {
    start: string; // "08:00"
    end: string;   // "17:00"
    workingDays: number[]; // 0=Sun, 1=Mon … 6=Sat
  };
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
  };
  storageLimit: number; // bytes — default 5 GB
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettingsDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    clinicName: { type: String, required: true, trim: true },
    clinicEmail: { type: String, trim: true },
    clinicPhone: { type: String, trim: true },
    clinicAddress: { type: String, trim: true },
    timezone: { type: String, default: "UTC" },
    currency: { type: String, default: "PHP" },
    dateFormat: { type: String, default: "MM/DD/YYYY" },
    timeFormat: { type: String, enum: ["12h", "24h"], default: "12h" },
    language: { type: String, enum: ["en", "es"], default: "en" },
    aiTriageEnabled: { type: Boolean, default: true },
    maxQuestionsPerSession: { type: Number, default: 8, min: 3, max: 20 },
    requireDoctorValidation: { type: Boolean, default: true },
    appointmentDurationMinutes: { type: Number, default: 30 },
    workingHours: {
      start: { type: String, default: "08:00" },
      end: { type: String, default: "17:00" },
      workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      pushEnabled: { type: Boolean, default: false },
    },
    storageLimit: {
      type: Number,
      default: 5 * 1024 * 1024 * 1024, // 5 GB in bytes
    },
  },
  { timestamps: true }
);

// Sparse unique index — one settings doc per tenant, nulls allowed
settingsSchema.index({ tenantId: 1 }, { unique: true, sparse: true });

const Settings =
  mongoose.models.Settings ||
  mongoose.model<ISettingsDocument>("Settings", settingsSchema);

export default Settings;

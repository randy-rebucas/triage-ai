import mongoose, { Schema, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────────
// PatientAccount — standalone patient model for the patient portal.
//
// Matches the schema documented in PATIENT_API.md §9.
// Auth fields (password, otp, otpExpiry, otpAttempts) are stored
// with select:false — they are never returned in query results
// unless explicitly selected with .select("+password ...").
//
// Collection: patientaccounts  (separate from the legacy
// User-linked Patient collection to avoid migration conflicts)
// ─────────────────────────────────────────────────────────────────

export interface IPatientAccount extends Document {
  tenantIds:             Types.ObjectId[];
  patientCode:           string;
  firstName:             string;
  middleName?:           string;
  lastName:              string;
  suffix?:               string;
  dateOfBirth:           Date;
  sex:                   "male" | "female" | "other";
  civilStatus?:          string;
  nationality?:          string;
  occupation?:           string;
  email?:                string;
  phone:                 string;
  contacts?:             Array<{ label?: string; phone?: string; email?: string }>;
  address:               { street: string; city: string; state: string; zipCode: string };
  emergencyContact?:     { name?: string; phone?: string; relationship?: string };
  identifiers?:          { philHealth?: string; govId?: string };
  medicalHistory?:       string;
  preExistingConditions?: Array<{ condition: string; status: "active" | "resolved" | "chronic" }>;
  allergies?:            Array<string | { substance: string; reaction: string; severity: string }>;
  discountEligibility?:  Record<string, unknown>;
  active:                boolean;
  readNotificationIds:   string[];
  // Auth — select:false
  password?:             string;
  otp?:                  string;
  otpExpiry?:            Date;
  otpAttempts?:          number;
  createdAt:             Date;
  updatedAt:             Date;

  comparePassword(candidate: string): Promise<boolean>;
  compareOtp(candidate: string): Promise<boolean>;
}

const patientAccountSchema = new Schema<IPatientAccount>(
  {
    tenantIds: {
      type: [Schema.Types.ObjectId],
      ref: "Tenant",
      default: [],
      index: true,
    },
    patientCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    firstName:  { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName:   { type: String, required: true, trim: true },
    suffix:     { type: String, trim: true },
    dateOfBirth: { type: Date, required: true },
    sex: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    civilStatus:  { type: String, trim: true },
    nationality:  { type: String, trim: true },
    occupation:   { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
    },
    phone: { type: String, required: true, trim: true },
    contacts: [
      {
        label: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true },
      },
    ],
    address: {
      street:  { type: String, trim: true, default: "" },
      city:    { type: String, trim: true, default: "" },
      state:   { type: String, trim: true, default: "" },
      zipCode: { type: String, trim: true, default: "" },
    },
    emergencyContact: {
      name:         { type: String, trim: true },
      phone:        { type: String, trim: true },
      relationship: { type: String, trim: true },
    },
    identifiers: {
      philHealth: { type: String, trim: true },
      govId:      { type: String, trim: true },
    },
    medicalHistory:        { type: String, default: "" },
    preExistingConditions: [
      {
        condition: { type: String, required: true },
        status:    { type: String, enum: ["active", "resolved", "chronic"], default: "active" },
      },
    ],
    allergies: { type: Schema.Types.Mixed, default: [] },
    discountEligibility: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
    readNotificationIds: { type: [String], default: [] },

    // ── Auth fields (never returned by default) ──────────────────
    password:    { type: String, select: false },
    otp:         { type: String, select: false },
    otpExpiry:   { type: Date,   select: false },
    otpAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true, collection: "patientaccounts" }
);

// ── Compound indexes ─────────────────────────────────────────────
patientAccountSchema.index({ email: 1, tenantIds: 1 }, { sparse: true });
patientAccountSchema.index({ phone: 1, tenantIds: 1 });
patientAccountSchema.index({ patientCode: 1, tenantIds: 1 }, { unique: true });

// ── Hash password before save ────────────────────────────────────
patientAccountSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
    this.password = await bcrypt.hash(this.password, rounds);
  }
  next();
});

patientAccountSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

patientAccountSchema.methods.compareOtp = async function (
  candidate: string
): Promise<boolean> {
  if (!this.otp) return false;
  return bcrypt.compare(candidate, this.otp);
};

const PatientAccount =
  mongoose.models.PatientAccount ||
  mongoose.model<IPatientAccount>("PatientAccount", patientAccountSchema);

export default PatientAccount;

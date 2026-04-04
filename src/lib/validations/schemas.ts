import { z } from "zod";

// ─────────────────────────────────────────────────────────────────
// Zod Validation Schemas — used across API routes
// ─────────────────────────────────────────────────────────────────

// ─── Auth ────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format")
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
  tenantSlug: z.string().optional(),
});

export const registerSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format")
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a number"
    ),
  name: z
    .string({ required_error: "Name is required" })
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  role: z.enum(["patient", "doctor"]).optional().default("patient"),
  tenantSlug: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z
    .enum(["male", "female", "other", "prefer_not_to_say"])
    .optional(),
  contactNumber: z.string().optional(),
});

// ─── Triage ──────────────────────────────────────────────────────

export const triageStartSchema = z.object({
  chiefComplaint: z
    .string({ required_error: "Please describe your main symptom or concern" })
    .min(10, "Please provide more detail about your symptoms (min 10 characters)")
    .max(1000, "Description cannot exceed 1000 characters"),
});

export const triageAnswerSchema = z.object({
  answer: z
    .string({ required_error: "Answer is required" })
    .min(1, "Please provide an answer")
    .max(500, "Answer cannot exceed 500 characters"),
});

// ─── Doctor Validation ───────────────────────────────────────────

export const doctorValidationSchema = z.object({
  finalDiagnosis: z
    .string({ required_error: "Diagnosis is required" })
    .min(3, "Diagnosis must be at least 3 characters"),
  icd10Code: z
    .string({ required_error: "ICD-10 code is required" })
    .regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/, "Invalid ICD-10 code format"),
  notes: z.string().optional().default(""),
  agreedWithAI: z.boolean(),
});

// ─── Clinical Records ─────────────────────────────────────────────

export const vitalsSchema = z.object({
  temperature: z.number().min(30).max(45).optional(),
  bloodPressureSystolic: z.number().min(50).max(300).optional(),
  bloodPressureDiastolic: z.number().min(30).max(200).optional(),
  heartRate: z.number().min(20).max(300).optional(),
  respiratoryRate: z.number().min(4).max(100).optional(),
  oxygenSaturation: z.number().min(50).max(100).optional(),
  weight: z.number().min(0).max(700).optional(),
  height: z.number().min(0).max(300).optional(),
});

export const prescriptionSchema = z.object({
  medication: z.string().min(1, "Medication name is required"),
  dosage: z.string().min(1, "Dosage is required"),
  frequency: z.string().min(1, "Frequency is required"),
  duration: z.string().min(1, "Duration is required"),
  notes: z.string().optional().default(""),
});

export const clinicalRecordSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  triageSessionId: z.string().optional(),
  visitDate: z.string().optional(),
  chiefComplaint: z.string().min(1, "Chief complaint is required"),
  vitals: vitalsSchema.optional(),
  diagnosis: z.object({
    name: z.string().min(1, "Diagnosis name is required"),
    icd10Code: z
      .string()
      .regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/, "Invalid ICD-10 code"),
    notes: z.string().optional().default(""),
  }),
  prescriptions: z.array(prescriptionSchema).optional().default([]),
  notes: z.string().optional().default(""),
  followUpDate: z.string().optional(),
  status: z.enum(["draft", "final"]).optional().default("draft"),
});

// ─── Patient Profile Update ───────────────────────────────────────

export const patientUpdateSchema = z.object({
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  bloodType: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .optional(),
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  emergencyContact: z
    .object({
      name: z.string(),
      relationship: z.string(),
      contactNumber: z.string(),
    })
    .optional(),
});

// ─── Query Params ────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type TriageStartInput = z.infer<typeof triageStartSchema>;
export type TriageAnswerInput = z.infer<typeof triageAnswerSchema>;
export type DoctorValidationInput = z.infer<typeof doctorValidationSchema>;
export type ClinicalRecordInput = z.infer<typeof clinicalRecordSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;

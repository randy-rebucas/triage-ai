// ─────────────────────────────────────────────────────────────────
// CMS Triage AI — Central Type Definitions
// ─────────────────────────────────────────────────────────────────

// ─── Enumerations ────────────────────────────────────────────────

export type UserRole = "patient" | "doctor" | "admin";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type TriageStatus =
  | "in-progress"
  | "completed"
  | "validated"
  | "archived";

export type RecordStatus = "draft" | "final";

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

// ─── Tenant ──────────────────────────────────────────────────────

export type TenantStatus = "active" | "inactive" | "suspended";
export type SubscriptionStatus = "active" | "cancelled" | "expired";
export type BillingCycle = "monthly" | "yearly";

export interface ITenantSettings {
  timezone: string;
  currency: string;
  currencySymbol?: string;
  currencyPosition: "before" | "after";
  dateFormat: string;
  timeFormat: "12h" | "24h";
  language: "en" | "es";
  numberFormat: {
    decimalSeparator: string;
    thousandsSeparator: string;
    decimalPlaces: number;
  };
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface IPaymentHistoryEntry {
  transactionId: string;
  orderId: string;
  amount: number;
  currency: string;
  payerEmail: string;
  plan: string;
  billingCycle: BillingCycle;
  status: string;
  paidAt: Date;
}

export interface ITenant {
  _id: string;
  name: string;
  subdomain: string;
  displayName?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings: ITenantSettings;
  status: TenantStatus;
  subscription: {
    plan?: string;
    status: SubscriptionStatus;
    billingCycle?: BillingCycle;
    expiresAt?: Date;
    renewalAt?: Date;
    paypalOrderId?: string;
    paypalSubscriptionId?: string;
    processedWebhookIds: string[];
    paymentHistory: IPaymentHistoryEntry[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantContext {
  tenantId: string | null;
  subdomain: string | null;
  tenant: ITenant | null;
}

// ─── User & Auth ─────────────────────────────────────────────────

export interface IUser {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  iat?: number;
  exp?: number;
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IRegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  // Patient-specific fields (optional at registration)
  dateOfBirth?: string;
  gender?: Gender;
  contactNumber?: string;
}

export interface IAuthResponse {
  token: string;
  user: Omit<IUser, "password">;
}

// ─── Patient ─────────────────────────────────────────────────────

export interface IEmergencyContact {
  name: string;
  relationship: string;
  contactNumber: string;
}

export interface IPatient {
  _id: string;
  userId: string;
  /** Array because one patient can be registered at multiple clinics */
  tenantIds: string[];
  dateOfBirth: Date;
  gender: Gender;
  contactNumber: string;
  address?: string;
  bloodType?: string;
  allergies: string[];
  medicalHistory: string[];
  emergencyContact?: IEmergencyContact;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPatientWithUser extends IPatient {
  user: IUser;
}

// ─── Triage Session ───────────────────────────────────────────────

export interface ITriageQuestion {
  questionId: string;
  question: string;
  answer: string;
  answeredAt: Date;
}

export interface IPossibleCondition {
  name: string;
  icd10Code: string;
  likelihood: "low" | "moderate" | "high";
  description: string;
}

export interface ISafetyFlag {
  flag: string;
  severity: "warning" | "urgent" | "emergency";
}

export interface IDoctorValidation {
  doctorId: string;
  doctorName: string;
  validatedAt: Date;
  finalDiagnosis: string;
  icd10Code: string;
  notes: string;
  agreedWithAI: boolean;
}

export interface ITriageSession {
  _id: string;
  tenantId: string;
  patientId: string;
  chiefComplaint: string;
  questions: ITriageQuestion[];
  currentQuestionIndex: number;
  totalQuestions: number;
  riskScore: number;
  riskLevel: RiskLevel;
  possibleConditions: IPossibleCondition[];
  aiSummary: string;
  recommendations: string[];
  safetyFlags: ISafetyFlag[];
  status: TriageStatus;
  doctorValidation?: IDoctorValidation;
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI Engine ───────────────────────────────────────────────────

export interface ITriageStartRequest {
  chiefComplaint: string;
}

export interface ITriageAnswerRequest {
  answer: string;
}

export interface IAIQuestionResponse {
  questionId: string;
  question: string;
  isLastQuestion: boolean;
  progress: number; // 0-100
}

export interface IAIRiskAssessment {
  riskScore: number;
  riskLevel: RiskLevel;
  safetyFlags: ISafetyFlag[];
  requiresEmergencyReferral: boolean;
}

export interface IAIReportResponse {
  possibleConditions: IPossibleCondition[];
  aiSummary: string;
  recommendations: string[];
  riskAssessment: IAIRiskAssessment;
  disclaimer: string;
}

// ─── Clinical Records ─────────────────────────────────────────────

export interface IVitals {
  temperature?: number; // Celsius
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number; // bpm
  respiratoryRate?: number;
  oxygenSaturation?: number; // SpO2 %
  weight?: number; // kg
  height?: number; // cm
}

export interface IPrescription {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes?: string;
}

export interface IDiagnosis {
  name: string;
  icd10Code: string;
  notes: string;
}

export interface IClinicalRecord {
  _id: string;
  tenantId: string;
  patientId: string;
  triageSessionId?: string;
  doctorId: string;
  visitDate: Date;
  chiefComplaint: string;
  vitals?: IVitals;
  diagnosis: IDiagnosis;
  prescriptions: IPrescription[];
  notes: string;
  followUpDate?: Date;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Audit Log ───────────────────────────────────────────────────

export type AuditAction =
  | "login"
  | "logout"
  | "register"
  | "view"
  | "create"
  | "update"
  | "delete"
  | "validate"
  | "export";

export interface IAuditLog {
  _id: string;
  tenantId?: string;
  userId: string;
  userRole: UserRole;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// ─── API Response Shapes ─────────────────────────────────────────

export interface IApiSuccess<T = unknown> {
  status: "success";
  data: T;
  message?: string;
}

export interface IApiError {
  status: "error";
  error: string;
  code?: string;
  details?: unknown;
}

export type IApiResponse<T = unknown> = IApiSuccess<T> | IApiError;

// ─── Pagination ──────────────────────────────────────────────────

export interface IPaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

export interface IPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Dashboard Stats ──────────────────────────────────────────────

export interface IDoctorDashboardStats {
  pendingReviews: number;
  todayPatients: number;
  criticalCases: number;
  totalPatients: number;
  recentSessions: ITriageSession[];
}

export interface IPatientDashboardStats {
  totalSessions: number;
  lastSession?: ITriageSession;
  totalRecords: number;
}

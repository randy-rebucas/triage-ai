import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/mongodb";
import PatientAccount, { type IPatientAccount } from "@/models/PatientAccount";
import { signPatientToken, type IPatientJwtPayload } from "@/lib/auth/patientJwt";
import { Types } from "mongoose";

// ─────────────────────────────────────────────────────────────────
// Patient Auth Service
// Business logic for all patient authentication flows.
// ─────────────────────────────────────────────────────────────────

// ── Response helpers ─────────────────────────────────────────────

interface PatientBasic {
  patientId:   string;
  patientCode: string;
  firstName:   string;
  lastName:    string;
  email:       string;
}

interface CookieLoginResult {
  token:   string;
  patient: PatientBasic;
}

interface BearerLoginResult {
  token:     string;
  expiresIn: number;
  patient:   { id: string; patientCode: string; firstName: string; lastName: string; email: string };
}

function toPatientBasic(p: IPatientAccount): PatientBasic {
  return {
    patientId:   p._id.toString(),
    patientCode: p.patientCode,
    firstName:   p.firstName,
    lastName:    p.lastName,
    email:       p.email || "",
  };
}

function buildPayload(p: IPatientAccount): Omit<IPatientJwtPayload, "type" | "iat" | "exp"> {
  return {
    patientId:   p._id.toString(),
    patientCode: p.patientCode,
    email:       p.email || "",
  };
}

// ── SMS helper ───────────────────────────────────────────────────
// Uses Twilio REST API directly (no SDK). Falls back to console
// in development when credentials are absent.

async function sendOtpSms(to: string, otp: string): Promise<void> {
  const sid    = process.env.TWILIO_ACCOUNT_SID;
  const token  = process.env.TWILIO_AUTH_TOKEN;
  const from   = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV OTP] SMS credentials not configured — OTP generated (not logged for security)`);
    }
    return;
  }

  const url  = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    To:   to,
    From: from,
    Body: `Your Triage AI verification code is: ${otp}. Valid for 5 minutes.`,
  });

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[sendOtpSms] Twilio error:", err);
    throw new Error("Failed to send OTP SMS");
  }
}

// ── 3.1 Email + password login (sets patient_session cookie) ─────

export async function loginWithPassword(
  email: string,
  password: string,
  tenantId?: string | null
): Promise<CookieLoginResult> {
  await connectDB();

  const query: Record<string, unknown> = { email: email.toLowerCase().trim() };
  if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

  const patient = await PatientAccount.findOne(query).select("+password");
  if (!patient) throw Object.assign(new Error("Invalid email or password"), { code: "INVALID_CREDENTIALS" });

  if (!patient.password) {
    throw Object.assign(
      new Error("This account does not have a password set. Please use Phone OTP or QR Code to sign in."),
      { code: "NO_PASSWORD" }
    );
  }

  if (!patient.active) {
    throw Object.assign(
      new Error("Patient account is inactive. Please contact the clinic."),
      { code: "INACTIVE" }
    );
  }

  const match = await patient.comparePassword(password);
  if (!match) throw Object.assign(new Error("Invalid email or password"), { code: "INVALID_CREDENTIALS" });

  const token = signPatientToken(buildPayload(patient));
  return { token, patient: toPatientBasic(patient) };
}

// ── 3.2 Request OTP ───────────────────────────────────────────────

export async function requestOtp(
  phone: string,
  tenantId?: string | null
): Promise<void> {
  await connectDB();

  // Always return success — never reveal whether the phone exists
  const query: Record<string, unknown> = {
    $or: [{ phone }, { "contacts.phone": phone }],
  };
  if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

  const patient = await PatientAccount.findOne(query).select("+otp +otpExpiry +otpAttempts");

  if (!patient || !patient.active) {
    // Silent — do not reveal phone existence
    return;
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
  const otpHash = await bcrypt.hash(otp, rounds);

  patient.otp         = otpHash;
  patient.otpExpiry   = new Date(Date.now() + 5 * 60 * 1000); // 5 min
  patient.otpAttempts = 0;
  await patient.save();

  await sendOtpSms(phone, otp);
}

// ── 3.3 Verify OTP (sets patient_session cookie) ─────────────────

export async function verifyOtp(
  phone: string,
  otp: string,
  tenantId?: string | null
): Promise<CookieLoginResult> {
  await connectDB();

  const query: Record<string, unknown> = {
    $or: [{ phone }, { "contacts.phone": phone }],
  };
  if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

  const patient = await PatientAccount.findOne(query).select("+otp +otpExpiry +otpAttempts");

  if (!patient || !patient.otp) {
    throw Object.assign(new Error("Invalid or expired OTP"), { code: "INVALID_OTP" });
  }

  if (!patient.active) {
    throw Object.assign(
      new Error("Patient account is inactive. Please contact the clinic."),
      { code: "INACTIVE" }
    );
  }

  if ((patient.otpAttempts ?? 0) >= 5) {
    throw Object.assign(
      new Error("Too many incorrect attempts. Please request a new OTP."),
      { code: "OTP_LOCKED" }
    );
  }

  if (patient.otpExpiry && patient.otpExpiry < new Date()) {
    throw Object.assign(new Error("OTP has expired. Please request a new one."), { code: "OTP_EXPIRED" });
  }

  const match = await patient.compareOtp(otp);
  if (!match) {
    patient.otpAttempts = (patient.otpAttempts ?? 0) + 1;
    await patient.save();
    throw Object.assign(new Error("Invalid or expired OTP"), { code: "INVALID_OTP" });
  }

  // Clear OTP fields on success
  patient.otp         = undefined;
  patient.otpExpiry   = undefined;
  patient.otpAttempts = 0;
  await patient.save();

  const token = signPatientToken(buildPayload(patient));
  return { token, patient: toPatientBasic(patient) };
}

// ── 3.4 Issue Bearer token (third-party apps) ─────────────────────

export async function issueToken(
  method: "password" | "otp",
  credentials: {
    email?: string; password?: string;
    phone?: string; otp?: string;
  },
  tenantId?: string | null
): Promise<BearerLoginResult> {
  await connectDB();

  let patient: IPatientAccount | null = null;

  if (method === "password") {
    const { email, password } = credentials;
    if (!email || !password) throw new Error("Email and password are required");

    const query: Record<string, unknown> = { email: email.toLowerCase().trim() };
    if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

    patient = await PatientAccount.findOne(query).select("+password");
    if (!patient || !patient.active) {
      throw Object.assign(new Error("Invalid email or password"), { code: "INVALID_CREDENTIALS" });
    }
    if (!patient.password) {
      throw Object.assign(
        new Error("This account has no password set. Please use OTP."),
        { code: "NO_PASSWORD" }
      );
    }
    const match = await patient.comparePassword(password!);
    if (!match) throw Object.assign(new Error("Invalid email or password"), { code: "INVALID_CREDENTIALS" });

  } else if (method === "otp") {
    const { phone, otp } = credentials;
    if (!phone || !otp) throw new Error("Phone number and OTP are required");

    const query: Record<string, unknown> = {
      $or: [{ phone }, { "contacts.phone": phone }],
    };
    if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

    patient = await PatientAccount.findOne(query).select("+otp +otpExpiry +otpAttempts");
    if (!patient || !patient.otp) {
      throw Object.assign(new Error("Invalid or expired OTP"), { code: "INVALID_OTP" });
    }
    if (!patient.active) {
      throw Object.assign(new Error("Account is inactive. Please contact the clinic."), { code: "INACTIVE" });
    }
    if ((patient.otpAttempts ?? 0) >= 5) {
      throw Object.assign(
        new Error("Too many incorrect attempts. Please request a new OTP."),
        { code: "OTP_LOCKED" }
      );
    }
    if (patient.otpExpiry && patient.otpExpiry < new Date()) {
      throw Object.assign(new Error("OTP has expired. Please request a new one."), { code: "OTP_EXPIRED" });
    }
    const match = await patient.compareOtp(otp!);
    if (!match) {
      patient.otpAttempts = (patient.otpAttempts ?? 0) + 1;
      await patient.save();
      throw Object.assign(new Error("Invalid or expired OTP"), { code: "INVALID_OTP" });
    }
    patient.otp         = undefined;
    patient.otpExpiry   = undefined;
    patient.otpAttempts = 0;
    await patient.save();

  } else {
    throw new Error("Invalid method. Use 'password' or 'otp'.");
  }

  const BEARER_TTL = 30 * 24 * 60 * 60;
  const token = signPatientToken(buildPayload(patient!), { bearer: true });

  return {
    token,
    expiresIn: BEARER_TTL,
    patient: {
      id:          patient!._id.toString(),
      patientCode: patient!.patientCode,
      firstName:   patient!.firstName,
      lastName:    patient!.lastName,
      email:       patient!.email || "",
    },
  };
}

// ── 3.5 Setup credentials ─────────────────────────────────────────

export async function setupCredentials(
  patientId: string,
  input: { email?: string; password: string; currentPassword?: string }
): Promise<string> {
  await connectDB();

  if (!input.password || input.password.length < 8) {
    throw Object.assign(new Error("Password must be at least 8 characters long"), { code: "VALIDATION" });
  }

  const patient = await PatientAccount.findById(patientId).select("+password");
  if (!patient) throw new Error("Patient not found");
  if (!patient.active) throw Object.assign(new Error("Account is inactive."), { code: "INACTIVE" });

  if (patient.password) {
    if (!input.currentPassword) {
      throw Object.assign(
        new Error("currentPassword is required when updating an existing password"),
        { code: "VALIDATION" }
      );
    }
    const match = await patient.comparePassword(input.currentPassword);
    if (!match) throw Object.assign(new Error("Current password is incorrect"), { code: "WRONG_PASSWORD" });
  }

  if (input.email) {
    const normalised = input.email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
      throw Object.assign(new Error("Invalid email format"), { code: "VALIDATION" });
    }
    // Check uniqueness across all tenants
    const conflict = await PatientAccount.findOne({
      email:  normalised,
      _id:    { $ne: patient._id },
      tenantIds: { $in: patient.tenantIds },
    });
    if (conflict) {
      throw Object.assign(
        new Error("This email is already registered to another patient in this clinic."),
        { code: "EMAIL_CONFLICT" }
      );
    }
    patient.email = normalised;
  }

  patient.password = input.password; // pre-save hook hashes it
  await patient.save();

  return patient.email || "";
}

// ── 3.6 QR login (sets patient_session cookie) ───────────────────

interface QrPayload {
  type:         string;
  patientId?:   string;
  patientCode?: string;
  tenantId?:    string;
}

export async function loginWithQr(
  qrCode: string | QrPayload,
  tenantId?: string | null
): Promise<CookieLoginResult> {
  await connectDB();

  let payload: QrPayload;
  if (typeof qrCode === "string") {
    try {
      payload = JSON.parse(qrCode);
    } catch {
      throw Object.assign(new Error("Invalid QR code format"), { code: "INVALID_QR" });
    }
  } else {
    payload = qrCode;
  }

  if (payload.type !== "patient_login") {
    throw Object.assign(
      new Error("Invalid QR code type. This QR code is not for patient login."),
      { code: "INVALID_QR_TYPE" }
    );
  }

  const id = payload.patientId || payload.patientCode;
  if (!id) {
    throw Object.assign(new Error("Patient identification not found in QR code"), { code: "INVALID_QR" });
  }

  const effectiveTenantId = tenantId || payload.tenantId;

  const query: Record<string, unknown> = {};
  if (payload.patientId && Types.ObjectId.isValid(payload.patientId)) {
    query._id = new Types.ObjectId(payload.patientId);
  } else if (payload.patientCode) {
    query.patientCode = payload.patientCode;
  }
  if (effectiveTenantId) query.tenantIds = new Types.ObjectId(effectiveTenantId);

  const patient = await PatientAccount.findOne(query);
  if (!patient) throw Object.assign(new Error("Patient not found"), { code: "NOT_FOUND" });
  if (!patient.active) {
    throw Object.assign(
      new Error("Patient account is inactive. Please contact the clinic."),
      { code: "INACTIVE" }
    );
  }

  const token = signPatientToken(buildPayload(patient));
  return { token, patient: toPatientBasic(patient) };
}

// ── Patient lookup (for third-party apps) ────────────────────────

export async function lookupPatient(
  tenantId: string,
  phone?: string,
  email?: string,
  patientCode?: string
): Promise<{ patientId: string; patientCode: string; firstName: string; lastName: string; authMethods: string[] } | null> {
  await connectDB();

  const query: Record<string, unknown> = { tenantIds: new Types.ObjectId(tenantId), active: true };

  if (phone) query.$or = [{ phone }, { "contacts.phone": phone }];
  else if (email) query.email = email.toLowerCase().trim();
  else if (patientCode) query.patientCode = patientCode;
  else return null;

  const patient = await PatientAccount.findOne(query).select("+password");
  if (!patient) return null;

  const authMethods: string[] = ["otp"];
  if (patient.password) authMethods.push("password");

  return {
    patientId:   patient._id.toString(),
    patientCode: patient.patientCode,
    firstName:   patient.firstName,
    lastName:    patient.lastName,
    authMethods,
  };
}

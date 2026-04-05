import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import TriageSession from "@/models/TriageSession";
import PatientAccount from "@/models/PatientAccount";
import {
  generateNextQuestion,
  calculateRiskScore,
  generateTriageReport,
  checkEmergencyKeywords,
} from "@/lib/ai/triageEngine";
import type { ITriageSession, RiskLevel } from "@/types";
import type { TriageStartInput, TriageAnswerInput } from "@/lib/validations/schemas";

// ─────────────────────────────────────────────────────────────────
// Triage Service — patient-only, uses PatientAccount model
//
// patientCode is the identifier that comes from the patient JWT
// (set by the external myclinicsoft API).
// A minimal local PatientAccount shadow record is upserted on
// first access so triage sessions have a stable local ObjectId.
// ─────────────────────────────────────────────────────────────────

function tenantFilter(tenantId: string | null) {
  return tenantId ? { tenantId: new Types.ObjectId(tenantId) } : {};
}

/** Find or create a local PatientAccount shadow by patientCode. */
async function resolveAccount(patientCode: string) {
  const account = await PatientAccount.findOneAndUpdate(
    { patientCode },
    { $setOnInsert: { patientCode, firstName: "", lastName: "", phone: "", dateOfBirth: new Date(0), sex: "other", address: { street: "", city: "", state: "", zipCode: "" } } },
    { upsert: true, new: true }
  );
  return account;
}

export async function startTriageSession(
  patientCode: string,
  input: TriageStartInput,
  tenantId: string | null
): Promise<{ session: ITriageSession; firstQuestion: string; questionId: string }> {
  await connectDB();

  const account       = await resolveAccount(patientCode);
  const emergencyFlags = checkEmergencyKeywords(input.chiefComplaint);

  const session = await TriageSession.create({
    tenantId:      tenantId ? new Types.ObjectId(tenantId) : undefined,
    patientId:     account._id,
    chiefComplaint: input.chiefComplaint,
    status:        "in-progress",
    safetyFlags:   emergencyFlags.map((flag) => ({ flag, severity: "emergency" as const })),
  });

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  const firstQ = await generateNextQuestion({
    chiefComplaint: input.chiefComplaint,
    answeredQuestions: [],
    patientAge,
    patientGender: account.sex,
  });

  await TriageSession.findByIdAndUpdate(session._id, { totalQuestions: 8 });

  return {
    session:       session.toJSON() as ITriageSession,
    firstQuestion: firstQ.question,
    questionId:    firstQ.questionId,
  };
}

export async function submitAnswer(
  sessionId: string,
  patientCode: string,
  input: TriageAnswerInput,
  tenantId: string | null
): Promise<{
  isComplete: boolean;
  nextQuestion?: string;
  nextQuestionId?: string;
  progress: number;
  session?: ITriageSession;
}> {
  await connectDB();

  const session = await TriageSession.findOne({ _id: sessionId, ...tenantFilter(tenantId) });
  if (!session) throw new Error("Triage session not found.");

  const account = await PatientAccount.findOne({ patientCode });
  if (!account || session.patientId.toString() !== account._id.toString()) {
    throw new Error("Access denied to this triage session.");
  }

  if (session.status !== "in-progress") {
    throw new Error("This triage session is already completed.");
  }

  const answeredQuestions = session.questions
    .filter((q: { answer: string }) => q.answer)
    .map((q: { question: string; answer: string }) => ({ question: q.question, answer: q.answer }));

  const lastQuestion = session.questions.length > 0
    ? session.questions[session.questions.length - 1]
    : null;

  const questionEntry = {
    questionId: `q_${session.currentQuestionIndex + 1}`,
    question:   lastQuestion?.question || `Question ${session.currentQuestionIndex + 1}`,
    answer:     input.answer,
    answeredAt: new Date(),
  };

  const updatedQuestions = [
    ...answeredQuestions,
    { question: questionEntry.question, answer: input.answer },
  ];

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  const nextQ = await generateNextQuestion({
    chiefComplaint:    session.chiefComplaint,
    answeredQuestions: updatedQuestions,
    patientAge,
    patientGender:     account.sex,
  });

  await TriageSession.findByIdAndUpdate(sessionId, {
    $push: { questions: questionEntry },
    $inc:  { currentQuestionIndex: 1 },
  });

  if (nextQ.isLastQuestion || updatedQuestions.length >= 8) {
    const completedSession = await completeTriageSession(
      sessionId, updatedQuestions, account, session.chiefComplaint
    );
    return { isComplete: true, progress: 100, session: completedSession };
  }

  await TriageSession.findByIdAndUpdate(sessionId, {
    $push: { questions: { questionId: nextQ.questionId, question: nextQ.question, answer: "", answeredAt: new Date() } },
  });

  return { isComplete: false, nextQuestion: nextQ.question, nextQuestionId: nextQ.questionId, progress: nextQ.progress };
}

async function completeTriageSession(
  sessionId: string,
  answeredQuestions: { question: string; answer: string }[],
  account: { dateOfBirth?: Date; sex?: string; medicalHistory?: string; allergies?: unknown[] },
  chiefComplaint: string
): Promise<ITriageSession> {
  await connectDB();

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  const allergies = Array.isArray(account.allergies)
    ? account.allergies.map((a) => (typeof a === "string" ? a : (a as { substance: string }).substance))
    : [];

  const riskResult = await calculateRiskScore({
    chiefComplaint, answeredQuestions, patientAge,
    patientGender:  account.sex,
    medicalHistory: account.medicalHistory ? [account.medicalHistory] : undefined,
    allergies,
  });

  const reportResult = await generateTriageReport({
    chiefComplaint, answeredQuestions,
    riskScore: riskResult.riskScore, riskLevel: riskResult.riskLevel,
    safetyFlags: riskResult.safetyFlags, patientAge,
    patientGender:  account.sex,
    medicalHistory: account.medicalHistory ? [account.medicalHistory] : undefined,
    allergies,
  });

  const session      = await TriageSession.findById(sessionId);
  const existingFlags = session?.safetyFlags || [];
  const mergedFlags   = [
    ...existingFlags,
    ...riskResult.safetyFlags.filter(
      (flag) => !existingFlags.some((ef: { flag: string }) => ef.flag === flag.flag)
    ),
  ];

  const updated = await TriageSession.findByIdAndUpdate(
    sessionId,
    {
      riskScore: riskResult.riskScore, riskLevel: riskResult.riskLevel as RiskLevel,
      safetyFlags: mergedFlags, possibleConditions: reportResult.possibleConditions,
      aiSummary: reportResult.aiSummary, recommendations: reportResult.recommendations,
      status: "completed",
    },
    { new: true }
  );

  return updated?.toJSON() as ITriageSession;
}

export async function getTriageSession(
  sessionId: string,
  patientCode: string,
  role: string,
  tenantId: string | null
): Promise<ITriageSession> {
  await connectDB();

  const session = await TriageSession.findOne({ _id: sessionId, ...tenantFilter(tenantId) }).lean() as unknown as ITriageSession | null;
  if (!session) throw new Error("Triage session not found.");

  if (role === "patient") {
    const account = await PatientAccount.findOne({ patientCode });
    if (!account || session.patientId.toString() !== account._id.toString()) {
      throw new Error("Access denied.");
    }
  }

  return session;
}

export async function getPatientTriageSessions(
  patientCode: string,
  tenantId: string | null,
  page  = 1,
  limit = 10
): Promise<{ sessions: ITriageSession[]; total: number }> {
  await connectDB();

  const account = await PatientAccount.findOne({ patientCode });
  if (!account) return { sessions: [], total: 0 };

  const filter = { patientId: account._id, ...tenantFilter(tenantId) };
  const skip   = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    TriageSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TriageSession.countDocuments(filter),
  ]);

  return { sessions: sessions as unknown as ITriageSession[], total };
}

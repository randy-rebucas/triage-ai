import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import TriageSession from "@/models/TriageSession";
import PatientAccount from "@/models/PatientAccount";
import {
  extractSymptoms,
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

function tenantFilter(tenantId: string | null): { tenantId: Types.ObjectId } {
  if (!tenantId) throw new Error("Tenant context is required");
  return { tenantId: new Types.ObjectId(tenantId) };
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
): Promise<{ session: ITriageSession; firstQuestion: string; questionId: string; inputType: "text" | "yes_no" | "slider" }> {
  await connectDB();

  const account        = await resolveAccount(patientCode);
  const emergencyFlags = checkEmergencyKeywords(input.chiefComplaint);

  const session = await TriageSession.create({
    tenantId:       tenantId ? new Types.ObjectId(tenantId) : undefined,
    patientId:      account._id,
    chiefComplaint: input.chiefComplaint,
    status:         "in-progress",
    safetyFlags:    emergencyFlags.map((flag) => ({ flag, severity: "emergency" as const })),
  });

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  // Stage 0 — Extract structured symptom data from the chief complaint.
  // This seeds the questioning stage so it targets uncovered dimensions.
  const extracted = await extractSymptoms({
    chiefComplaint: input.chiefComplaint,
    patientAge,
    patientGender:  account.sex,
  });

  const firstQ = await generateNextQuestion({
    chiefComplaint:    input.chiefComplaint,
    answeredQuestions: [],
    patientAge,
    patientGender:     account.sex,
    extractedSymptoms: extracted,
  });

  // Store the first question as a pending placeholder so its text is
  // preserved when the patient submits their answer.
  await TriageSession.findByIdAndUpdate(session._id, {
    totalQuestions:   8,
    extractedSymptoms: extracted,
    $push: {
      qaFlow: {
        questionId: firstQ.questionId,
        question:   firstQ.question,
        answer:     "",
        answeredAt: new Date(),
      },
    },
  });

  return {
    session:       session.toJSON() as ITriageSession,
    firstQuestion: firstQ.question,
    questionId:    firstQ.questionId,
    inputType:     firstQ.inputType ?? "text",
  };
}

export async function submitAnswer(
  sessionId: string,
  patientCode: string,
  input: TriageAnswerInput,
  tenantId: string | null
): Promise<{
  isComplete:      boolean;
  nextQuestion?:   string;
  nextQuestionId?: string;
  inputType?:      "text" | "yes_no" | "slider";
  progress:        number;
  session?:        ITriageSession;
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

  // The last qaFlow entry is always the pending (unanswered) question
  // that was stored when the session started or after the previous answer.
  const pendingIdx   = session.qaFlow.length - 1;
  const pendingEntry = session.qaFlow[pendingIdx] as { question: string; questionId: string } | undefined;

  // Build answered-questions context from all entries EXCEPT the current pending one
  const answeredQuestions = session.qaFlow
    .slice(0, pendingIdx)
    .filter((q: { answer: string }) => q.answer && q.answer.trim())
    .map((q: { question: string; answer: string }) => ({ question: q.question, answer: q.answer }));

  const currentQuestion = pendingEntry?.question ?? `Question ${session.currentQuestionIndex + 1}`;

  const updatedQuestions = [
    ...answeredQuestions,
    { question: currentQuestion, answer: input.answer },
  ];

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  const nextQ = await generateNextQuestion({
    chiefComplaint:    session.chiefComplaint,
    answeredQuestions: updatedQuestions,
    patientAge,
    patientGender:     account.sex,
    extractedSymptoms: session.extractedSymptoms,
  });

  // Write the patient's answer into the pending entry (no new entry pushed yet).
  await TriageSession.findByIdAndUpdate(sessionId, {
    $set: {
      [`qaFlow.${pendingIdx}.answer`]:     input.answer,
      [`qaFlow.${pendingIdx}.answeredAt`]: new Date(),
    },
    $inc: { currentQuestionIndex: 1 },
  });

  if (nextQ.isLastQuestion || updatedQuestions.length >= 8) {
    const completedSession = await completeTriageSession(
      sessionId, updatedQuestions, account, session.chiefComplaint
    );
    return { isComplete: true, progress: 100, session: completedSession };
  }

  // Push the next question as a new pending placeholder.
  await TriageSession.findByIdAndUpdate(sessionId, {
    $push: {
      qaFlow: {
        questionId: nextQ.questionId,
        question:   nextQ.question,
        answer:     "",
        answeredAt: new Date(),
      },
    },
  });

  return {
    isComplete:     false,
    nextQuestion:   nextQ.question,
    nextQuestionId: nextQ.questionId,
    inputType:      nextQ.inputType ?? "text",
    progress:       nextQ.progress,
  };
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

  const sessionDoc = await TriageSession.findById(sessionId);
  const extractedSymptoms = sessionDoc?.extractedSymptoms;

  const riskResult = await calculateRiskScore({
    chiefComplaint, answeredQuestions, patientAge,
    patientGender:  account.sex,
    medicalHistory: account.medicalHistory ? [account.medicalHistory] : undefined,
    allergies,
    extractedSymptoms,
  });

  const reportResult = await generateTriageReport({
    chiefComplaint, answeredQuestions,
    riskScore:      riskResult.riskScore,
    riskLevel:      riskResult.riskLevel,
    safetyFlags:    riskResult.safetyFlags,
    patientAge,
    patientGender:  account.sex,
    medicalHistory: account.medicalHistory ? [account.medicalHistory] : undefined,
    allergies,
    extractedSymptoms,
    riskReasoning:  riskResult.reasoning,
  });

  const session       = await TriageSession.findById(sessionId);
  const existingFlags = session?.safetyFlags || [];
  const mergedFlags   = [
    ...existingFlags,
    ...riskResult.safetyFlags.filter(
      (flag) => !existingFlags.some((ef: { flag: string }) => ef.flag === flag.flag)
    ),
  ];

  const aiReport = {
    summary:            reportResult.summary,
    possibleConditions: reportResult.possibleConditions,
    recommendations:    reportResult.recommendations,
    redFlags:           reportResult.redFlags,
    urgency:            reportResult.urgency,
    followUpTimeframe:  reportResult.followUpTimeframe,
    disclaimer:         reportResult.disclaimer,
  };

  const updated = await TriageSession.findByIdAndUpdate(
    sessionId,
    {
      riskScore:   riskResult.riskScore,
      riskLevel:   riskResult.riskLevel as RiskLevel,
      safetyFlags: mergedFlags,
      aiReport,
      status:      "pending_review",
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

  const session = await TriageSession.findOne({
    _id: sessionId,
    ...tenantFilter(tenantId),
  }).lean() as unknown as ITriageSession | null;

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

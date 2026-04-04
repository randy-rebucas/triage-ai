import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import TriageSession from "@/models/TriageSession";
import Patient from "@/models/Patient";
import {
  generateNextQuestion,
  calculateRiskScore,
  generateTriageReport,
  checkEmergencyKeywords,
} from "@/lib/ai/triageEngine";
import { createPatientTenantFilter } from "@/lib/tenant-query";
import type { ITriageSession, RiskLevel } from "@/types";
import type {
  TriageStartInput,
  TriageAnswerInput,
  DoctorValidationInput,
} from "@/lib/validations/schemas";

// ─────────────────────────────────────────────────────────────────
// Triage Service — tenant-isolated
// ─────────────────────────────────────────────────────────────────

function tenantFilter(tenantId: string | null) {
  return tenantId ? { tenantId: new Types.ObjectId(tenantId) } : {};
}

export async function startTriageSession(
  userId: string,
  input: TriageStartInput,
  tenantId: string | null
): Promise<{ session: ITriageSession; firstQuestion: string; questionId: string }> {
  await connectDB();

  const patientFilter = createPatientTenantFilter(tenantId);
  const patient = await Patient.findOne({ userId, ...patientFilter });
  if (!patient) {
    throw new Error(
      "Patient profile not found. Please complete your profile first."
    );
  }

  const emergencyFlags = checkEmergencyKeywords(input.chiefComplaint);

  const session = await TriageSession.create({
    tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
    patientId: patient._id,
    chiefComplaint: input.chiefComplaint,
    status: "in-progress",
    safetyFlags: emergencyFlags.map((flag) => ({
      flag,
      severity: "emergency" as const,
    })),
  });

  const patientAge = patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(patient.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : undefined;

  const firstQ = await generateNextQuestion({
    chiefComplaint: input.chiefComplaint,
    answeredQuestions: [],
    patientAge,
    patientGender: patient.gender,
  });

  await TriageSession.findByIdAndUpdate(session._id, { totalQuestions: 8 });

  return {
    session: session.toJSON() as ITriageSession,
    firstQuestion: firstQ.question,
    questionId: firstQ.questionId,
  };
}

export async function submitAnswer(
  sessionId: string,
  userId: string,
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

  const sessionFilter = { _id: sessionId, ...tenantFilter(tenantId) };
  const session = await TriageSession.findOne(sessionFilter);
  if (!session) throw new Error("Triage session not found.");

  const patientFilter = createPatientTenantFilter(tenantId);
  const patient = await Patient.findOne({ userId, ...patientFilter });
  if (!patient || session.patientId.toString() !== patient._id.toString()) {
    throw new Error("Access denied to this triage session.");
  }

  if (session.status !== "in-progress") {
    throw new Error("This triage session is already completed.");
  }

  const currentIdx = session.currentQuestionIndex;
  const answeredQuestions = session.questions
    .filter((q: { answer: string }) => q.answer)
    .map((q: { question: string; answer: string }) => ({
      question: q.question,
      answer: q.answer,
    }));

  const lastQuestion =
    session.questions.length > 0
      ? session.questions[session.questions.length - 1]
      : null;

  const questionEntry = {
    questionId: `q_${currentIdx + 1}`,
    question: lastQuestion?.question || `Question ${currentIdx + 1}`,
    answer: input.answer,
    answeredAt: new Date(),
  };

  const updatedQuestions = [
    ...answeredQuestions,
    { question: questionEntry.question, answer: input.answer },
  ];

  const patientAge = patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(patient.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : undefined;

  const nextQ = await generateNextQuestion({
    chiefComplaint: session.chiefComplaint,
    answeredQuestions: updatedQuestions,
    patientAge,
    patientGender: patient.gender,
  });

  await TriageSession.findByIdAndUpdate(sessionId, {
    $push: { questions: questionEntry },
    $inc: { currentQuestionIndex: 1 },
  });

  if (nextQ.isLastQuestion || updatedQuestions.length >= 8) {
    const completedSession = await completeTriageSession(
      sessionId,
      updatedQuestions,
      patient,
      session.chiefComplaint
    );
    return { isComplete: true, progress: 100, session: completedSession };
  }

  await TriageSession.findByIdAndUpdate(sessionId, {
    $push: {
      questions: {
        questionId: nextQ.questionId,
        question: nextQ.question,
        answer: "",
        answeredAt: new Date(),
      },
    },
  });

  return {
    isComplete: false,
    nextQuestion: nextQ.question,
    nextQuestionId: nextQ.questionId,
    progress: nextQ.progress,
  };
}

async function completeTriageSession(
  sessionId: string,
  answeredQuestions: { question: string; answer: string }[],
  patient: {
    dateOfBirth?: Date;
    gender?: string;
    medicalHistory?: string[];
    allergies?: string[];
  },
  chiefComplaint: string
): Promise<ITriageSession> {
  await connectDB();

  const patientAge = patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(patient.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : undefined;

  const riskResult = await calculateRiskScore({
    chiefComplaint,
    answeredQuestions,
    patientAge,
    patientGender: patient.gender,
    medicalHistory: patient.medicalHistory,
    allergies: patient.allergies,
  });

  const reportResult = await generateTriageReport({
    chiefComplaint,
    answeredQuestions,
    riskScore: riskResult.riskScore,
    riskLevel: riskResult.riskLevel,
    safetyFlags: riskResult.safetyFlags,
    patientAge,
    patientGender: patient.gender,
    medicalHistory: patient.medicalHistory,
    allergies: patient.allergies,
  });

  const session = await TriageSession.findById(sessionId);
  const existingFlags = session?.safetyFlags || [];
  const mergedFlags = [
    ...existingFlags,
    ...riskResult.safetyFlags.filter(
      (flag) => !existingFlags.some((ef: { flag: string }) => ef.flag === flag.flag)
    ),
  ];

  const updated = await TriageSession.findByIdAndUpdate(
    sessionId,
    {
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel as RiskLevel,
      safetyFlags: mergedFlags,
      possibleConditions: reportResult.possibleConditions,
      aiSummary: reportResult.aiSummary,
      recommendations: reportResult.recommendations,
      status: "completed",
    },
    { new: true }
  );

  return updated?.toJSON() as ITriageSession;
}

export async function getTriageSession(
  sessionId: string,
  userId: string,
  role: string,
  tenantId: string | null
): Promise<ITriageSession> {
  await connectDB();

  const filter = { _id: sessionId, ...tenantFilter(tenantId) };
  const session = await TriageSession.findOne(filter).lean() as unknown as ITriageSession | null;
  if (!session) throw new Error("Triage session not found.");

  if (role === "patient") {
    const patientFilter = createPatientTenantFilter(tenantId);
    const patient = await Patient.findOne({ userId, ...patientFilter });
    if (!patient || session.patientId.toString() !== patient._id.toString()) {
      throw new Error("Access denied.");
    }
  }

  return session;
}

export async function getPatientTriageSessions(
  userId: string,
  tenantId: string | null,
  page = 1,
  limit = 10
): Promise<{ sessions: ITriageSession[]; total: number }> {
  await connectDB();

  const patientFilter = createPatientTenantFilter(tenantId);
  const patient = await Patient.findOne({ userId, ...patientFilter });
  if (!patient) return { sessions: [], total: 0 };

  const filter = { patientId: patient._id, ...tenantFilter(tenantId) };
  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    TriageSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TriageSession.countDocuments(filter),
  ]);

  return { sessions: sessions as unknown as ITriageSession[], total };
}

export async function getPendingReviews(
  tenantId: string | null,
  page = 1,
  limit = 10,
  riskLevel?: string
): Promise<{ sessions: ITriageSession[]; total: number }> {
  await connectDB();

  const filter: Record<string, unknown> = {
    status: "completed",
    ...tenantFilter(tenantId),
  };
  if (riskLevel) filter.riskLevel = riskLevel;

  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    TriageSession.find(filter)
      .sort({ riskScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "patientId",
        populate: { path: "userId", select: "name email" },
      })
      .lean(),
    TriageSession.countDocuments(filter),
  ]);

  return { sessions: sessions as unknown as ITriageSession[], total };
}

export async function validateTriageSession(
  sessionId: string,
  doctorUserId: string,
  doctorName: string,
  input: DoctorValidationInput,
  tenantId: string | null
): Promise<ITriageSession> {
  await connectDB();

  const filter = { _id: sessionId, ...tenantFilter(tenantId) };
  const session = await TriageSession.findOne(filter);
  if (!session) throw new Error("Triage session not found.");
  if (session.status !== "completed") throw new Error("Only completed sessions can be validated.");

  const updated = await TriageSession.findByIdAndUpdate(
    sessionId,
    {
      status: "validated",
      doctorValidation: {
        doctorId: doctorUserId,
        doctorName,
        validatedAt: new Date(),
        finalDiagnosis: input.finalDiagnosis,
        icd10Code: input.icd10Code,
        notes: input.notes,
        agreedWithAI: input.agreedWithAI,
      },
    },
    { new: true }
  );

  return updated?.toJSON() as ITriageSession;
}

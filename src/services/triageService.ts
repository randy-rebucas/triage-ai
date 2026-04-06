import connectDB from "@/lib/db/mongodb";
import TriageSession from "@/models/TriageSession";
import PatientAccount from "@/models/PatientAccount";
import {
  extractSymptoms,
  generateNextQuestion,
  streamNextQuestion,
  calculateRiskScore,
  generateTriageReport,
  checkEmergencyKeywords,
  type StreamingQuestionEvent,
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

function tenantFilter(tenantId: string | null): { tenantId: string } {
  if (!tenantId) throw new Error("Tenant context is required");
  return { tenantId };
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
): Promise<{ session: ITriageSession; firstQuestion: string; questionId: string; inputType: "text" | "yes_no" | "slider"; isEmergency: boolean }> {
  await connectDB();

  const account        = await resolveAccount(patientCode);
  const emergencyFlags = checkEmergencyKeywords(input.chiefComplaint);

  const session = await TriageSession.create({
    tenantId,
    patientId: account._id,
    chiefComplaint: input.chiefComplaint,
    status:         "in-progress",
    safetyFlags:    emergencyFlags.map((flag) => ({ flag, severity: "emergency" as const })),
  });

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  // ── Stages 0 + 1 in parallel ────────────────────────────────────
  // Extraction (Stage 0) and first question (Stage 1) are independent
  // enough to run concurrently. The first question is generated without
  // extraction context (it only uses the chief complaint) — this is
  // acceptable because the extraction context is most valuable from
  // Q2 onwards. Running both at once halves the session-start latency.
  const [extracted, firstQ] = await Promise.all([
    extractSymptoms({
      chiefComplaint: input.chiefComplaint,
      patientAge,
      patientGender:  account.sex,
    }),
    generateNextQuestion({
      chiefComplaint:    input.chiefComplaint,
      answeredQuestions: [],
      patientAge,
      patientGender:     account.sex,
      // extractedSymptoms intentionally omitted — not yet available
    }),
  ]);

  // ── Emergency fast-path ─────────────────────────────────────────
  const allRedFlags = [
    ...emergencyFlags,
    ...extracted.redFlagLanguage,
  ];

  if (allRedFlags.length > 0 && emergencyFlags.length > 0) {
    const completedSession = await completeTriageSession(
      session._id.toString(),
      [],
      account,
      input.chiefComplaint,
    );

    return {
      session:       completedSession,
      firstQuestion: "⚠️ Based on your symptoms, we have fast-tracked your assessment for immediate clinical review. Please seek emergency care now if you are in danger.",
      questionId:    "emergency_fast_path",
      inputType:     "text" as const,
      isEmergency:   true,
    };
  }
  // ── Normal Q&A path ─────────────────────────────────────────────

  // Store the first question as a pending placeholder so its text is
  // preserved when the patient submits their answer.
  const updatedSession = await TriageSession.findByIdAndUpdate(
    session._id,
    {
      totalQuestions:    8,
      extractedSymptoms: extracted,
      $push: {
        qaFlow: {
          questionId: firstQ.questionId,
          question:   firstQ.question,
          answer:     "",
          answeredAt: new Date(),
        },
      },
    },
    { new: true },
  );

  return {
    session:       (updatedSession ?? session).toJSON() as ITriageSession,
    firstQuestion: firstQ.question,
    questionId:    firstQ.questionId,
    inputType:     firstQ.inputType ?? "text",
    isEmergency:   false,
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

  // Single DB fetch — reused for both extractedSymptoms and existingFlags
  const sessionDoc        = await TriageSession.findById(sessionId);
  const extractedSymptoms = sessionDoc?.extractedSymptoms;
  const existingFlags     = sessionDoc?.safetyFlags || [];

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

  const mergedFlags = [
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

// ─────────────────────────────────────────────────────────────────
// Streaming answer — same logic as submitAnswer but yields SSE events
// for the next question instead of returning a JSON object.
// ─────────────────────────────────────────────────────────────────

export async function* streamAnswer(
  sessionId:   string,
  patientCode: string,
  input:       { answer: string; questionId?: string },
  tenantId:    string | null,
): AsyncGenerator<StreamingQuestionEvent | Record<string, unknown>> {
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

  const pendingIdx   = session.qaFlow.length - 1;
  const pendingEntry = session.qaFlow[pendingIdx] as { question: string; questionId: string } | undefined;

  const answeredQuestions = session.qaFlow
    .slice(0, pendingIdx)
    .filter((q: { answer: string }) => q.answer?.trim())
    .map((q: { question: string; answer: string }) => ({ question: q.question, answer: q.answer }));

  const currentQuestion  = pendingEntry?.question ?? `Question ${session.currentQuestionIndex + 1}`;
  const updatedQuestions = [
    ...answeredQuestions,
    { question: currentQuestion, answer: input.answer },
  ];

  const patientAge = account.dateOfBirth && account.dateOfBirth.getFullYear() > 1970
    ? Math.floor((Date.now() - account.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : undefined;

  // Save the answer
  await TriageSession.findByIdAndUpdate(sessionId, {
    $set: {
      [`qaFlow.${pendingIdx}.answer`]:     input.answer,
      [`qaFlow.${pendingIdx}.answeredAt`]: new Date(),
    },
    $inc: { currentQuestionIndex: 1 },
  });

  const isLastByCount = updatedQuestions.length >= 8;

  if (isLastByCount) {
    // ── Streamed completion with live progress events ───────────
    yield { type: "progress", step: 1, message: "Reviewing your responses…" };

    // Reuse patientAge computed above — no re-calculation needed
    const allergiesC = Array.isArray(account.allergies)
      ? account.allergies.map((a: unknown) => (typeof a === "string" ? a : (a as { substance: string }).substance))
      : [];
    // Single DB fetch for extractedSymptoms + existingFlags
    const sessionDocC     = await TriageSession.findById(sessionId);
    const extractedC      = sessionDocC?.extractedSymptoms;
    const existingFlagsC  = sessionDocC?.safetyFlags || [];
    const chiefComplaintC = session.chiefComplaint;

    yield { type: "progress", step: 2, message: "Calculating risk assessment…" };

    const riskResult = await calculateRiskScore({
      chiefComplaint:    chiefComplaintC,
      answeredQuestions: updatedQuestions,
      patientAge,
      patientGender:     account.sex,
      medicalHistory:    account.medicalHistory ? [account.medicalHistory] : undefined,
      allergies:         allergiesC,
      extractedSymptoms: extractedC,
    });

    yield { type: "progress", step: 3, message: "Generating your clinical report…" };

    const reportResult = await generateTriageReport({
      chiefComplaint:    chiefComplaintC,
      answeredQuestions: updatedQuestions,
      riskScore:         riskResult.riskScore,
      riskLevel:         riskResult.riskLevel,
      safetyFlags:       riskResult.safetyFlags,
      patientAge,
      patientGender:     account.sex,
      medicalHistory:    account.medicalHistory ? [account.medicalHistory] : undefined,
      allergies:         allergiesC,
      extractedSymptoms: extractedC,
      riskReasoning:     riskResult.reasoning,
    });

    // Merge safety flags (de-duplicate)
    const mergedFlagsC = [
      ...existingFlagsC,
      ...riskResult.safetyFlags.filter(
        (f) => !existingFlagsC.some((ef: { flag: string }) => ef.flag === f.flag)
      ),
    ];

    const updatedC = await TriageSession.findByIdAndUpdate(
      sessionId,
      {
        riskScore:   riskResult.riskScore,
        riskLevel:   riskResult.riskLevel as import("@/types").RiskLevel,
        safetyFlags: mergedFlagsC,
        status:      "pending_review",
        aiReport: {
          summary:            reportResult.summary,
          possibleConditions: reportResult.possibleConditions,
          recommendations:    reportResult.recommendations,
          redFlags:           reportResult.redFlags,
          urgency:            reportResult.urgency,
          followUpTimeframe:  reportResult.followUpTimeframe,
          disclaimer:         reportResult.disclaimer,
        },
      },
      { new: true }
    );
    if (!updatedC) {
      yield { type: "error", message: "Failed to save assessment. Please try again." };
      return;
    }
    const cs = updatedC.toJSON() as import("@/types").ITriageSession;
    yield {
      type:    "complete",
      session: {
        _id:            cs._id,
        status:         cs.status,
        riskLevel:      cs.riskLevel,
        riskScore:      cs.riskScore,
        chiefComplaint: cs.chiefComplaint,
        createdAt:      cs.createdAt,
        safetyFlags:    cs.safetyFlags,
        qaFlow:         cs.qaFlow,
        aiReport:       cs.aiReport
          ? {
              summary:            cs.aiReport.summary,
              possibleConditions: cs.aiReport.possibleConditions,
              recommendations:    cs.aiReport.recommendations,
              redFlags:           cs.aiReport.redFlags,
              urgency:            cs.aiReport.urgency,
              followUpTimeframe:  cs.aiReport.followUpTimeframe,
              disclaimer:         cs.aiReport.disclaimer,
            }
          : undefined,
      },
    };
    return;
  }

  // Stream the next question token by token
  let lastMeta:        StreamingQuestionEvent["meta"] | undefined;
  let streamedQuestion = "";   // accumulate tokens for display (client already saw them)

  for await (const event of streamNextQuestion({
    chiefComplaint:    session.chiefComplaint,
    answeredQuestions: updatedQuestions,
    patientAge,
    patientGender:     account.sex,
    extractedSymptoms: session.extractedSymptoms,
  })) {
    if (event.type === "token" && event.text) streamedQuestion += event.text;
    if (event.type === "meta")               lastMeta = event.meta;
    yield event;
  }

  // Persist the next question to DB after streaming is complete
  if (lastMeta) {
    // Unify the completion threshold: >= 8 answered questions in both paths
    const isNowLastQuestion = lastMeta.isLastQuestion || updatedQuestions.length >= 8;

    if (isNowLastQuestion) {
      yield { type: "progress", step: 1, message: "Reviewing your responses…" };
      yield { type: "progress", step: 2, message: "Calculating risk assessment…" };
      const completedSession = await completeTriageSession(
        sessionId, updatedQuestions, account, session.chiefComplaint
      );
      yield { type: "progress", step: 3, message: "Generating your clinical report…" };
      yield {
        type:    "complete",
        session: completedSession
          ? {
              _id:            completedSession._id,
              status:         completedSession.status,
              riskLevel:      completedSession.riskLevel,
              riskScore:      completedSession.riskScore,
              chiefComplaint: completedSession.chiefComplaint,
              createdAt:      completedSession.createdAt,
              safetyFlags:    completedSession.safetyFlags,
              qaFlow:         completedSession.qaFlow,
              aiReport:       completedSession.aiReport
                ? {
                    summary:            completedSession.aiReport.summary,
                    possibleConditions: completedSession.aiReport.possibleConditions,
                    recommendations:    completedSession.aiReport.recommendations,
                    redFlags:           completedSession.aiReport.redFlags,
                    urgency:            completedSession.aiReport.urgency,
                    followUpTimeframe:  completedSession.aiReport.followUpTimeframe,
                    disclaimer:         completedSession.aiReport.disclaimer,
                  }
                : undefined,
            }
          : undefined,
      };
    } else {
      // Use the clean question text from the parsed JSON metadata as the
      // authoritative source for DB storage.  The streamed tokens are for
      // real-time display only and may be subtly different (whitespace, etc.).
      // Strip any leaked delimiter/metadata from the token stream as a fallback.
      const cleanStreamed = streamedQuestion.replace(/\n---[\s\S]*$/, "").trim();
      const questionText  = lastMeta.question || cleanStreamed || lastMeta.questionId;

      await TriageSession.findByIdAndUpdate(sessionId, {
        $push: {
          qaFlow: {
            questionId: lastMeta.questionId,
            question:   questionText,
            answer:     "",
            answeredAt: new Date(),
          },
        },
      });
    }
  }
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

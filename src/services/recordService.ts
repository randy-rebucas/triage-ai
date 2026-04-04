import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import ClinicalRecord from "@/models/ClinicalRecord";
import Patient from "@/models/Patient";
import { createPatientTenantFilter } from "@/lib/tenant-query";
import type { IClinicalRecord } from "@/types";
import type { ClinicalRecordInput } from "@/lib/validations/schemas";

// ─────────────────────────────────────────────────────────────────
// Clinical Record Service — tenant-isolated
// ─────────────────────────────────────────────────────────────────

function tenantFilter(tenantId: string | null) {
  return tenantId ? { tenantId: new Types.ObjectId(tenantId) } : {};
}

export async function createClinicalRecord(
  doctorId: string,
  input: ClinicalRecordInput,
  tenantId: string | null
): Promise<IClinicalRecord> {
  await connectDB();

  const record = await ClinicalRecord.create({
    tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
    patientId: input.patientId,
    triageSessionId: input.triageSessionId || null,
    doctorId,
    visitDate: input.visitDate ? new Date(input.visitDate) : new Date(),
    chiefComplaint: input.chiefComplaint,
    vitals: input.vitals,
    diagnosis: input.diagnosis,
    prescriptions: input.prescriptions || [],
    notes: input.notes || "",
    followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
    status: input.status || "draft",
  });

  return record.toJSON() as IClinicalRecord;
}

export async function updateClinicalRecord(
  recordId: string,
  doctorId: string,
  input: Partial<ClinicalRecordInput>,
  tenantId: string | null
): Promise<IClinicalRecord> {
  await connectDB();

  const filter = { _id: recordId, ...tenantFilter(tenantId) };
  const record = await ClinicalRecord.findOne(filter);
  if (!record) throw new Error("Clinical record not found.");
  if (record.doctorId.toString() !== doctorId) throw new Error("You can only edit your own clinical records.");
  if (record.status === "final") throw new Error("Finalized records cannot be modified.");

  const update: Record<string, unknown> = {};
  if (input.chiefComplaint) update.chiefComplaint = input.chiefComplaint;
  if (input.vitals) update.vitals = input.vitals;
  if (input.diagnosis) update.diagnosis = input.diagnosis;
  if (input.prescriptions) update.prescriptions = input.prescriptions;
  if (input.notes !== undefined) update.notes = input.notes;
  if (input.followUpDate) update.followUpDate = new Date(input.followUpDate);
  if (input.status) update.status = input.status;

  const updated = await ClinicalRecord.findByIdAndUpdate(
    recordId,
    { $set: update },
    { new: true }
  );

  return updated?.toJSON() as IClinicalRecord;
}

export async function getClinicalRecord(
  recordId: string,
  requesterId: string,
  requesterRole: string,
  tenantId: string | null
): Promise<IClinicalRecord> {
  await connectDB();

  const filter = { _id: recordId, ...tenantFilter(tenantId) };
  const record = await ClinicalRecord.findOne(filter).lean() as unknown as IClinicalRecord | null;
  if (!record) throw new Error("Clinical record not found.");

  if (requesterRole === "patient") {
    const patientFilter = createPatientTenantFilter(tenantId);
    const patient = await Patient.findOne({ userId: requesterId, ...patientFilter });
    if (!patient || record.patientId.toString() !== patient._id.toString()) {
      throw new Error("Access denied.");
    }
  }

  return record;
}

export async function getPatientRecords(
  patientId: string,
  requesterId: string,
  requesterRole: string,
  tenantId: string | null,
  page = 1,
  limit = 10
): Promise<{ records: IClinicalRecord[]; total: number }> {
  await connectDB();

  if (requesterRole === "patient") {
    const patientFilter = createPatientTenantFilter(tenantId);
    const patient = await Patient.findOne({ userId: requesterId, ...patientFilter });
    if (!patient || patient._id.toString() !== patientId) throw new Error("Access denied.");
  }

  const filter = { patientId, ...tenantFilter(tenantId) };
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    ClinicalRecord.find(filter).sort({ visitDate: -1 }).skip(skip).limit(limit).lean(),
    ClinicalRecord.countDocuments(filter),
  ]);

  return { records: records as unknown as IClinicalRecord[], total };
}

export async function getDoctorRecords(
  doctorId: string,
  tenantId: string | null,
  page = 1,
  limit = 10
): Promise<{ records: IClinicalRecord[]; total: number }> {
  await connectDB();

  const filter = { doctorId, ...tenantFilter(tenantId) };
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    ClinicalRecord.find(filter).sort({ visitDate: -1 }).skip(skip).limit(limit).lean(),
    ClinicalRecord.countDocuments(filter),
  ]);

  return { records: records as unknown as IClinicalRecord[], total };
}

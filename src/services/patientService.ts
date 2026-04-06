import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import Patient from "@/models/Patient";
import User from "@/models/User";
import { createPatientTenantFilter } from "@/lib/tenant-query";
import type { IPatientWithUser } from "@/types";
import type { PatientUpdateInput } from "@/lib/validations/schemas";

// ─────────────────────────────────────────────────────────────────
// Patient Service — tenant-isolated
// Patient.tenantIds is an array (patients can belong to many clinics)
// ─────────────────────────────────────────────────────────────────

function populateUser(query: ReturnType<typeof Patient.findOne | typeof Patient.findById>) {
  return query.populate("userId", "-password");
}

function toWithUser(p: unknown): IPatientWithUser {
  const patient = p as { userId: unknown } & Record<string, unknown>;
  return { ...patient, user: patient.userId } as unknown as IPatientWithUser;
}

export async function getPatientProfile(
  userId: string,
  tenantId: string | null
): Promise<IPatientWithUser | null> {
  await connectDB();
  const filter = { userId, ...createPatientTenantFilter(tenantId) };
  const patient = await Patient.findOne(filter).populate("userId", "-password").lean();
  if (!patient) return null;
  return toWithUser(patient);
}

export async function updatePatientProfile(
  userId: string,
  input: PatientUpdateInput,
  tenantId: string | null
): Promise<IPatientWithUser> {
  await connectDB();

  const update: Record<string, unknown> = {};
  if (input.dateOfBirth) update.dateOfBirth = new Date(input.dateOfBirth);
  if (input.gender) update.gender = input.gender;
  if (input.contactNumber) update.contactNumber = input.contactNumber;
  if (input.address !== undefined) update.address = input.address;
  if (input.bloodType) update.bloodType = input.bloodType;
  if (input.allergies) update.allergies = input.allergies;
  if (input.medicalHistory) update.medicalHistory = input.medicalHistory;
  if (input.emergencyContact) update.emergencyContact = input.emergencyContact;

  const filter = { userId, ...createPatientTenantFilter(tenantId) };

  // Build the full update — scalar fields via $set, tenant membership via $addToSet
  const mongoUpdate: Record<string, unknown> = { $set: update };
  if (tenantId) {
    mongoUpdate.$addToSet = { tenantIds: new Types.ObjectId(tenantId) };
  }

  const patient = await Patient.findOneAndUpdate(
    filter,
    mongoUpdate,
    { new: true, upsert: false }
  ).populate("userId", "-password").lean();

  if (!patient) throw new Error("Patient profile not found.");
  return toWithUser(patient);
}

export async function getAllPatients(
  tenantId: string | null,
  page = 1,
  limit = 10,
  search?: string
): Promise<{ patients: IPatientWithUser[]; total: number }> {
  await connectDB();

  let userIds: string[] | undefined;
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const users = await User.find({
      role: "patient",
      $or: [
        { name: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
      ],
    }).select("_id");
    userIds = users.map((u) => u._id.toString());
  }

  const filter: Record<string, unknown> = {
    ...createPatientTenantFilter(tenantId),
  };
  if (userIds) filter.userId = { $in: userIds };

  const skip = (page - 1) * limit;
  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .populate("userId", "-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Patient.countDocuments(filter),
  ]);

  return { patients: patients.map(toWithUser), total };
}

export async function getPatientById(
  patientId: string,
  tenantId: string | null
): Promise<IPatientWithUser | null> {
  await connectDB();
  const filter = { _id: patientId, ...createPatientTenantFilter(tenantId) };
  const patient = await Patient.findOne(filter).populate("userId", "-password").lean();
  if (!patient) return null;
  return toWithUser(patient);
}

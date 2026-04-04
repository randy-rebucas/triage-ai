import connectDB from "@/lib/db/mongodb";
import User from "@/models/User";
import Patient from "@/models/Patient";
import { signToken } from "@/lib/auth/jwt";
import type { RegisterInput, LoginInput } from "@/lib/validations/schemas";
import type { IAuthResponse, IUser } from "@/types";
import { Types } from "mongoose";

// ─────────────────────────────────────────────────────────────────
// Auth Service — tenant-aware
// ─────────────────────────────────────────────────────────────────

export async function registerUser(
  input: RegisterInput,
  tenantId?: string | null
): Promise<IAuthResponse> {
  await connectDB();

  const existing = await User.findOne({ email: input.email });
  if (existing) throw new Error("An account with this email already exists.");

  const user = await User.create({
    email: input.email,
    password: input.password,
    name: input.name,
    role: input.role || "patient",
    tenantId: tenantId ? new Types.ObjectId(tenantId) : null,
  });

  // Create patient profile if registering as patient
  if (user.role === "patient" && input.dateOfBirth && input.gender) {
    await Patient.create({
      userId: user._id,
      tenantIds: tenantId ? [new Types.ObjectId(tenantId)] : [],
      dateOfBirth: new Date(input.dateOfBirth),
      gender: input.gender,
      contactNumber: input.contactNumber || "",
    });
  }

  const token = signToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    tenantId: tenantId ?? undefined,
  });

  return { token, user: user.toJSON() as unknown as IUser };
}

export async function loginUser(
  input: LoginInput,
  tenantId?: string | null
): Promise<IAuthResponse> {
  await connectDB();

  const user = await User.findByEmail(input.email);
  if (!user) throw new Error("Invalid email or password.");
  if (!user.isActive) throw new Error("This account has been deactivated. Contact support.");

  const userTenantId = (user as unknown as { tenantId?: { toString(): string } }).tenantId;

  // If a tenant is resolved from the subdomain, verify the user belongs to it
  if (tenantId && userTenantId) {
    if (userTenantId.toString() !== tenantId) {
      throw new Error("Invalid email or password.");
    }
  }

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) throw new Error("Invalid email or password.");

  await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

  // tenantId priority: user's own tenantId > resolved from subdomain
  const effectiveTenantId = userTenantId?.toString() || tenantId || undefined;

  const token = signToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    tenantId: effectiveTenantId,
  });

  return {
    token,
    user: {
      _id: user._id.toString() as string,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: effectiveTenantId,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    } as IUser,
  };
}

export async function getUserById(userId: string): Promise<IUser | null> {
  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user) return null;
  return user as unknown as IUser;
}

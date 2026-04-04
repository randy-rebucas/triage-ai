import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/types";

// ─────────────────────────────────────────────────────────────────
// User Model
// Stores auth credentials and role. Personal profile is in Patient.
// ─────────────────────────────────────────────────────────────────

export interface IUserDocument extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tenantId?: import("mongoose").Types.ObjectId | null;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  comparePassword(candidate: string): Promise<boolean>;
}

interface IUserModel extends Model<IUserDocument> {
  findByEmail(email: string): Promise<IUserDocument | null>;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never return password by default
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    role: {
      type: String,
      enum: ["patient", "doctor", "admin"],
      default: "patient",
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret["password"];
        return ret;
      },
    },
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = this as any;
  if (!this.isModified("password")) return next();

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
  doc.password = await bcrypt.hash(doc.password as string, rounds);
  next();
});

// Instance method: compare plaintext password with stored hash
userSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bcrypt.compare(candidate, (this as any).password as string);
};

// Static method: find user with password field included
userSchema.statics.findByEmail = function (
  email: string
): Promise<IUserDocument | null> {
  return this.findOne({ email: email.toLowerCase() }).select("+password");
};

// Compound index for role + active queries (email index is created by unique:true above)
userSchema.index({ role: 1, isActive: 1 });

const User =
  (mongoose.models.User as IUserModel) ||
  mongoose.model<IUserDocument, IUserModel>("User", userSchema);

export default User;

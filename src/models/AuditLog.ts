import mongoose, { Schema, Document, Types } from "mongoose";
import type { AuditAction, UserRole } from "@/types";

// ─────────────────────────────────────────────────────────────────
// AuditLog Model
// Immutable log of all sensitive actions for PH DPA compliance.
// Records are never updated or deleted — only inserted.
// ─────────────────────────────────────────────────────────────────

export interface IAuditLogDocument extends Document {
  tenantId?: Types.ObjectId | null;
  userId: Types.ObjectId;
  userRole: UserRole;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userRole: {
      type: String,
      enum: ["patient", "doctor", "admin"],
      required: true,
    },
    action: {
      type: String,
      enum: [
        "login",
        "logout",
        "register",
        "view",
        "create",
        "update",
        "delete",
        "validate",
        "export",
      ],
      required: true,
    },
    resource: {
      type: String,
      required: true,
      trim: true,
    },
    resourceId: {
      type: String,
      default: null,
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true, // Prevents modification after creation
    },
  },
  {
    // Disable updatedAt — audit logs are immutable
    timestamps: { createdAt: false, updatedAt: false },
    // Use capped collection for automatic size management in production
    // capped: { size: 104857600, max: 500000 }, // 100MB cap
  }
);

// Indexes optimised for audit queries
auditLogSchema.index({ tenantId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, resource: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

// Prevent updates and deletes — audit logs must be immutable
auditLogSchema.pre("findOneAndUpdate", function () {
  throw new Error("AuditLog records cannot be modified");
});

const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLogDocument>("AuditLog", auditLogSchema);

export default AuditLog;

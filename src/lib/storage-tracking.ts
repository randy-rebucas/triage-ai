import { Types } from "mongoose";
import connectDB from "@/lib/db/mongodb";
import Patient from "@/models/Patient";
import Settings from "@/models/Settings";

// ─────────────────────────────────────────────────────────────────
// Storage Tracking
// Calculates per-tenant storage usage by aggregating file sizes
// from all models that store attachments.
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GB

export interface StorageUsage {
  totalBytes: number;
  limitBytes: number;
  usagePercent: number;
  breakdown: {
    patientAttachments: number;
  };
}

export async function getStorageUsage(tenantId: string): Promise<StorageUsage> {
  await connectDB();

  const tid = new Types.ObjectId(tenantId);

  // Patient attachments
  const patientAgg = await Patient.aggregate([
    { $match: { tenantIds: tid } },
    { $unwind: { path: "$attachments", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$attachments.size", 0] } },
      },
    },
  ]);

  const patientBytes: number = patientAgg[0]?.total || 0;
  const totalBytes = patientBytes;

  // Get storage limit from Settings
  const settings = await Settings.findOne({ tenantId: tid }, "storageLimit").lean();
  const limitBytes =
    (settings as unknown as { storageLimit?: number } | null)?.storageLimit ||
    DEFAULT_STORAGE_LIMIT;

  return {
    totalBytes,
    limitBytes,
    usagePercent: limitBytes > 0 ? (totalBytes / limitBytes) * 100 : 0,
    breakdown: {
      patientAttachments: patientBytes,
    },
  };
}

/**
 * Check if a file upload is allowed given the current storage usage.
 * Returns { allowed, currentUsage, reason? }
 */
export async function checkStorageLimit(
  tenantId: string,
  fileSizeBytes: number
): Promise<{ allowed: boolean; currentUsage: number; reason?: string }> {
  const usage = await getStorageUsage(tenantId);

  if (usage.totalBytes + fileSizeBytes > usage.limitBytes) {
    const mbNeeded = ((usage.totalBytes + fileSizeBytes - usage.limitBytes) / (1024 * 1024)).toFixed(1);
    return {
      allowed: false,
      currentUsage: usage.totalBytes,
      reason: `Storage limit exceeded. Free ${mbNeeded} MB to continue uploading.`,
    };
  }

  return { allowed: true, currentUsage: usage.totalBytes };
}

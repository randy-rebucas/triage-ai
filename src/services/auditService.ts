import connectDB from "@/lib/db/mongodb";
import AuditLog from "@/models/AuditLog";
import type { AuditAction, UserRole } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Audit Service — tenant-aware, immutable, fire-and-forget
// ─────────────────────────────────────────────────────────────────

interface AuditEntry {
  tenantId?: string;
  userId: string;
  userRole: UserRole;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  if (process.env.ENABLE_AUDIT_LOGS !== "true") return;

  setImmediate(async () => {
    try {
      await connectDB();
      await AuditLog.create({ ...entry, timestamp: new Date() });
    } catch (err) {
      console.error("[AuditService] Failed to write audit log:", err);
    }
  });
}

export function getClientIP(
  headers: Headers | Record<string, string | null>
): string {
  const get = (key: string): string | null => {
    if (headers instanceof Headers) return headers.get(key);
    return (headers as Record<string, string | null>)[key] ?? null;
  };
  return (
    get("x-forwarded-for")?.split(",")[0]?.trim() ||
    get("x-real-ip") ||
    "unknown"
  );
}

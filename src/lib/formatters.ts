// ─────────────────────────────────────────────────────────────────
// Shared UI formatters — used across patient-facing pages
// ─────────────────────────────────────────────────────────────────

/** Returns a consistent human-readable label for a triage session status. */
export function formatSessionStatus(status: string): string {
  switch (status) {
    case "reviewed":       return "Reviewed";
    case "pending_review": return "Pending Review";
    case "in-progress":    return "In Progress";
    default:               return "Submitted";
  }
}

/** Returns the Badge variant for a triage session status. */
export function sessionStatusVariant(
  status: string
): "success" | "info" | "warning" | "default" {
  switch (status) {
    case "reviewed":       return "success";
    case "pending_review": return "info";
    case "in-progress":    return "warning";
    default:               return "default";
  }
}

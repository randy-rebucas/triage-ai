import { Resend } from "resend";
import type { ITriageSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Email helper — Resend SDK + HTML report template.
//
// Requires:  RESEND_API_KEY  (and optionally SMTP_FROM for the
// "from" address).  Throws a descriptive error when unconfigured
// so callers can return a 503 with a friendly message.
// ─────────────────────────────────────────────────────────────────

/** Escape user-controlled text before embedding in HTML email bodies. */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY in your environment."
    );
  }
  return new Resend(key);
}

function getFrom(): string {
  return process.env.SMTP_FROM ?? "Triage AI <no-reply@triageai.com>";
}

// ── Risk-level badge colours (inline so all email clients render) ──
const RISK_COLOUR: Record<string, string> = {
  low:      "#16a34a",
  medium:   "#d97706",
  high:     "#ea580c",
  critical: "#dc2626",
};

function riskBadge(level: string) {
  const colour = RISK_COLOUR[esc(level)] ?? "#6b7280";
  const label  = esc(level.charAt(0).toUpperCase() + level.slice(1));
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;
    background:${colour};color:#fff;font-size:12px;font-weight:600;">${label} Risk</span>`;
}

function safetyFlagsList(flags: ITriageSession["safetyFlags"]) {
  if (!flags?.length) return "";
  const items = flags
    .map(
      (f) =>
        `<li style="margin:4px 0;color:#374151;">
          <span style="color:${
            f.severity === "emergency" ? "#dc2626" :
            f.severity === "urgent"    ? "#ea580c" : "#d97706"
          }">●</span>&nbsp;${esc(f.flag)}
        </li>`
    )
    .join("");
  return `
    <h3 style="margin:20px 0 8px;font-size:15px;color:#111827;">Attention Points</h3>
    <ul style="padding-left:16px;margin:0;">${items}</ul>`;
}

function recommendationsList(recs?: string[]) {
  if (!recs?.length) return "";
  const items = recs.map((r) => `<li style="margin:4px 0;color:#374151;">${esc(r)}</li>`).join("");
  return `
    <h3 style="margin:20px 0 8px;font-size:15px;color:#111827;">Recommendations</h3>
    <ul style="padding-left:16px;margin:0;">${items}</ul>`;
}

function redFlagsList(flags?: string[]) {
  if (!flags?.length) return "";
  const items = flags.map((f) => `<li style="margin:4px 0;color:#dc2626;">${esc(f)}</li>`).join("");
  return `
    <h3 style="margin:20px 0 8px;font-size:15px;color:#dc2626;">Red Flags</h3>
    <ul style="padding-left:16px;margin:0;">${items}</ul>`;
}

export function buildReportHtml(session: ITriageSession): string {
  const { aiReport, safetyFlags, chiefComplaint, riskLevel, riskScore, createdAt } = session;
  const dateStr = createdAt ? new Date(createdAt).toLocaleString() : "N/A";

  const summaryRows = [
    aiReport?.summary?.duration ? `<tr><td style="padding:4px 8px;width:120px;color:#6b7280;font-size:12px;text-transform:uppercase;">Duration</td><td style="padding:4px 8px;color:#111827;">${esc(aiReport.summary.duration)}</td></tr>` : "",
    aiReport?.summary?.severity ? `<tr><td style="padding:4px 8px;width:120px;color:#6b7280;font-size:12px;text-transform:uppercase;">Severity</td><td style="padding:4px 8px;color:#111827;">${esc(aiReport.summary.severity)}</td></tr>` : "",
    aiReport?.summary?.onset    ? `<tr><td style="padding:4px 8px;width:120px;color:#6b7280;font-size:12px;text-transform:uppercase;">Onset</td><td style="padding:4px 8px;color:#111827;">${esc(aiReport.summary.onset)}</td></tr>` : "",
  ].join("");

  const summaryBlock = summaryRows
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${summaryRows}</table>`
    : "";

  const followUp = aiReport?.followUpTimeframe
    ? `<p style="margin:20px 0 0;color:#374151;"><strong>Recommended Follow-up:</strong> ${esc(aiReport.followUpTimeframe)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Triage Assessment Report</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif;">
  <table role="presentation" style="width:100%;max-width:600px;margin:32px auto;background:#fff;
      border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

    <!-- Header -->
    <tr>
      <td style="background:#1d4ed8;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">
          Pre-Consultation Assessment Report
        </h1>
        <p style="margin:4px 0 0;font-size:13px;color:#bfdbfe;">Generated ${dateStr}</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:28px 32px;">

        <!-- Risk summary -->
        <div style="display:flex;align-items:center;justify-content:space-between;
            margin-bottom:20px;padding:16px;background:#f9fafb;border-radius:8px;
            border:1px solid #e5e7eb;">
          <div>
            <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;
                letter-spacing:.05em;color:#6b7280;">Main Concern</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">
              ${esc(chiefComplaint)}
            </p>
          </div>
          <div style="text-align:right;">
            ${riskBadge(riskLevel)}
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Score: ${riskScore ?? 0}/100</p>
          </div>
        </div>

        ${summaryBlock}
        ${safetyFlagsList(safetyFlags)}
        ${recommendationsList(aiReport?.recommendations)}
        ${redFlagsList(aiReport?.redFlags)}
        ${followUp}

        <!-- Disclaimer -->
        <div style="margin-top:28px;padding:16px;background:#eff6ff;border-radius:8px;
            border:1px solid #bfdbfe;">
          <p style="margin:0;font-size:12px;color:#1e40af;">
            <strong>Important Notice:</strong>
            ${esc(aiReport?.disclaimer ?? "This summary was generated by an AI assistant to help your clinician understand your symptoms. It is NOT a medical diagnosis. Please consult a healthcare professional for proper evaluation and advice.")}
          </p>
        </div>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
          This report is confidential and intended only for the recipient.
          Do not share with unauthorised parties.
        </p>
      </td>
    </tr>

  </table>
</body>
</html>`;
}

export interface SendReportEmailOptions {
  to:        string;
  session:   ITriageSession;
  fromName?: string;
}

export async function sendReportEmail({ to, session }: SendReportEmailOptions) {
  const resend = getResend();

  const { error } = await resend.emails.send({
    from:    getFrom(),
    to:      [to],
    subject: "Your Pre-Consultation Assessment Report",
    html:    buildReportHtml(session),
    text: [
      "Pre-Consultation Assessment Report",
      `Date: ${session.createdAt ? new Date(session.createdAt).toLocaleString() : "N/A"}`,
      `Main Concern: ${session.chiefComplaint}`,
      `Risk Level: ${session.riskLevel} (${session.riskScore ?? 0}/100)`,
      "",
      "Recommendations:",
      ...(session.aiReport?.recommendations?.map((r) => `  • ${r}`) ?? ["  N/A"]),
      "",
      "IMPORTANT: This is not a medical diagnosis. Consult a healthcare professional.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message ?? "Resend failed to deliver the email.");
  }
}

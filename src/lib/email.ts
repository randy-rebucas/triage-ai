import { Resend } from "resend";
import { format } from "date-fns";
import type { ITriageSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Email helper — Resend SDK + HTML report template.
//
// Required env vars:
//   RESEND_API_KEY  — get from resend.com/api-keys
//   SMTP_FROM       — must be a Resend-verified domain address,
//                     e.g. "Triage AI <no-reply@yourdomain.com>"
//                     For dev/test use "onboarding@resend.dev"
//
// Throws a descriptive error when unconfigured so callers can
// return a 503 with a friendly message.
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

// ── Resend singleton — created once per cold start ────────────────
let _resend: Resend | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY in your environment."
    );
  }
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function getFrom(): string {
  // SMTP_FROM must use a Resend-verified domain in production.
  // For local dev / testing, fall back to Resend's shared test sender.
  return (
    process.env.SMTP_FROM ??
    (process.env.NODE_ENV === "production"
      ? "Triage AI <no-reply@triageai.com>"
      : "Triage AI <onboarding@resend.dev>")
  );
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

// ── Risk-level badge colours (inline so all email clients render) ──
const RISK_COLOUR: Record<string, string> = {
  low:      "#16a34a",
  medium:   "#d97706",
  high:     "#ea580c",
  critical: "#dc2626",
};

function riskBadge(level: string) {
  const colour = RISK_COLOUR[level] ?? "#6b7280";
  const label  = esc(level.charAt(0).toUpperCase() + level.slice(1));
  return `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;
    background:${colour};color:#fff;font-size:12px;font-weight:700;
    letter-spacing:.03em;">${label} Risk</span>`;
}

function safetyFlagsList(flags: ITriageSession["safetyFlags"]) {
  if (!flags?.length) return "";
  const items = flags
    .map(
      (f) =>
        `<tr><td style="padding:5px 0 5px 8px;color:#374151;font-size:14px;">
          <span style="color:${
            f.severity === "emergency" ? "#dc2626" :
            f.severity === "urgent"    ? "#ea580c" : "#d97706"
          };font-size:10px;">&#9679;</span>&nbsp;${esc(f.flag)}
        </td></tr>`
    )
    .join("");
  return `
    <h3 style="margin:24px 0 8px;font-size:14px;font-weight:700;
      color:#111827;letter-spacing:.03em;text-transform:uppercase;">Attention Points</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse;">${items}</table>`;
}

function recommendationsList(recs?: string[]) {
  if (!recs?.length) return "";
  const items = recs
    .map(
      (r, i) =>
        `<tr><td style="padding:5px 0;font-size:14px;color:#374151;">
          <span style="display:inline-block;width:20px;font-weight:700;
            color:#2563eb;">${i + 1}.</span>${esc(r)}
        </td></tr>`
    )
    .join("");
  return `
    <h3 style="margin:24px 0 8px;font-size:14px;font-weight:700;
      color:#111827;letter-spacing:.03em;text-transform:uppercase;">Recommendations</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse;">${items}</table>`;
}

function redFlagsList(flags?: string[]) {
  if (!flags?.length) return "";
  const items = flags
    .map(
      (f) =>
        `<tr><td style="padding:5px 0 5px 8px;font-size:14px;color:#dc2626;">
          <span style="font-size:10px;">&#9679;</span>&nbsp;${esc(f)}
        </td></tr>`
    )
    .join("");
  return `
    <h3 style="margin:24px 0 8px;font-size:14px;font-weight:700;
      color:#dc2626;letter-spacing:.03em;text-transform:uppercase;">
      &#9888; Red Flags — Seek Care Promptly</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse;">${items}</table>`;
}

export function buildReportHtml(session: ITriageSession, viewUrl?: string): string {
  const { aiReport, safetyFlags, chiefComplaint, riskLevel, riskScore, createdAt } = session;

  const dateStr = createdAt
    ? format(new Date(createdAt), "MMMM d, yyyy 'at' h:mm a")
    : "N/A";

  // Summary table rows
  const summaryRows = [
    aiReport?.summary?.duration
      ? `<tr>
           <td style="padding:6px 12px 6px 0;width:110px;color:#6b7280;font-size:11px;
             font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">
             Duration</td>
           <td style="padding:6px 0;color:#111827;font-size:14px;">${esc(aiReport.summary.duration)}</td>
         </tr>` : "",
    aiReport?.summary?.severity
      ? `<tr>
           <td style="padding:6px 12px 6px 0;width:110px;color:#6b7280;font-size:11px;
             font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">
             Severity</td>
           <td style="padding:6px 0;color:#111827;font-size:14px;">${esc(aiReport.summary.severity)}</td>
         </tr>` : "",
    aiReport?.summary?.onset
      ? `<tr>
           <td style="padding:6px 12px 6px 0;width:110px;color:#6b7280;font-size:11px;
             font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">
             Onset</td>
           <td style="padding:6px 0;color:#111827;font-size:14px;">${esc(aiReport.summary.onset)}</td>
         </tr>` : "",
  ].join("");

  const summaryBlock = summaryRows
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;
         margin-top:8px;">${summaryRows}</table>`
    : "";

  const followUp = aiReport?.followUpTimeframe
    ? `<table role="presentation" style="width:100%;margin-top:20px;">
         <tr>
           <td style="padding:14px 16px;background:#eff6ff;border-radius:8px;
             border:1px solid #bfdbfe;">
             <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;
               text-transform:uppercase;letter-spacing:.05em;">Recommended Follow-up</p>
             <p style="margin:0;font-size:14px;color:#1d4ed8;">${esc(aiReport.followUpTimeframe)}</p>
           </td>
         </tr>
       </table>` : "";

  const viewOnlineBlock = viewUrl
    ? `<table role="presentation" style="width:100%;margin:24px 0 0;">
         <tr>
           <td style="text-align:center;">
             <a href="${esc(viewUrl)}"
               style="display:inline-block;padding:12px 28px;background:#2563eb;
                 color:#fff;font-size:14px;font-weight:700;text-decoration:none;
                 border-radius:8px;letter-spacing:.02em;">
               View Full Report Online
             </a>
           </td>
         </tr>
       </table>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Triage Assessment Report</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;
  -webkit-text-size-adjust:100%;mso-line-height-rule:exactly;">

  <table role="presentation" style="width:100%;background:#f3f4f6;" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:32px 16px;">

        <!-- Card wrapper -->
        <table role="presentation" style="width:100%;max-width:600px;margin:0 auto;
          background:#fff;border-radius:12px;overflow:hidden;
          border:1px solid #e5e7eb;" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background:#1d4ed8;padding:24px 32px;">
              <h1 style="margin:0 0 4px;font-size:20px;color:#fff;font-weight:700;
                font-family:Arial,Helvetica,sans-serif;">
                Pre-Consultation Assessment Report
              </h1>
              <p style="margin:0;font-size:13px;color:#bfdbfe;font-family:Arial,Helvetica,sans-serif;">
                Generated ${dateStr}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">

              <!-- Risk summary (table layout — Outlook safe) -->
              <table role="presentation" style="width:100%;border-collapse:collapse;
                margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;
                background:#f9fafb;" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;
                      text-transform:uppercase;letter-spacing:.05em;
                      font-family:Arial,Helvetica,sans-serif;">Main Concern</p>
                    <p style="margin:0;font-size:15px;font-weight:700;color:#111827;
                      font-family:Arial,Helvetica,sans-serif;">${esc(chiefComplaint)}</p>
                  </td>
                  <td style="padding:16px;text-align:right;vertical-align:top;white-space:nowrap;">
                    ${riskBadge(riskLevel)}
                    <p style="margin:6px 0 0;font-size:12px;color:#6b7280;
                      font-family:Arial,Helvetica,sans-serif;">Score: ${riskScore ?? 0}/100</p>
                  </td>
                </tr>
              </table>

              ${summaryBlock}
              ${safetyFlagsList(safetyFlags)}
              ${recommendationsList(aiReport?.recommendations)}
              ${redFlagsList(aiReport?.redFlags)}
              ${followUp}
              ${viewOnlineBlock}

              <!-- Disclaimer -->
              <table role="presentation" style="width:100%;margin-top:28px;" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:16px;background:#eff6ff;border-radius:8px;
                    border:1px solid #bfdbfe;">
                    <p style="margin:0;font-size:12px;color:#1e40af;line-height:1.5;
                      font-family:Arial,Helvetica,sans-serif;">
                      <strong>Important Notice:</strong>&nbsp;${esc(
                        aiReport?.disclaimer ??
                        "This summary was generated by an AI assistant to help your clinician understand your symptoms. It is NOT a medical diagnosis. Please consult a healthcare professional for proper evaluation and advice."
                      )}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;
                font-family:Arial,Helvetica,sans-serif;">
                This report is confidential and intended only for the recipient.
                Do not share with unauthorised parties.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card wrapper -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export interface SendReportEmailOptions {
  to:        string;
  session:   ITriageSession;
  /** Tenant slug — used to build the "View report online" link */
  tenantSlug?: string;
}

export async function sendReportEmail({ to, session, tenantSlug }: SendReportEmailOptions) {
  const resend = getResend();

  // Build the direct link to the saved report if tenant + session ID are available
  const viewUrl = tenantSlug && session._id
    ? `${getAppUrl()}/${tenantSlug}/patient/reports/${session._id}`
    : undefined;

  // Subject: personalised but concise — improves open rate and avoids spam filters
  const shortComplaint = session.chiefComplaint.length > 60
    ? session.chiefComplaint.slice(0, 57) + "…"
    : session.chiefComplaint;
  const subject = `Your Triage Assessment Report — ${shortComplaint}`;

  const { error } = await resend.emails.send({
    from:    getFrom(),
    to:      [to],
    subject,
    html:    buildReportHtml(session, viewUrl),
    text: [
      "Pre-Consultation Assessment Report",
      `Date     : ${session.createdAt ? format(new Date(session.createdAt), "PPP 'at' p") : "N/A"}`,
      `Concern  : ${session.chiefComplaint}`,
      `Risk     : ${session.riskLevel} (${session.riskScore ?? 0}/100)`,
      "",
      "Recommendations:",
      ...(session.aiReport?.recommendations?.map((r) => `  • ${r}`) ?? ["  N/A"]),
      "",
      ...(viewUrl ? [`View report online: ${viewUrl}`, ""] : []),
      "IMPORTANT: This is not a medical diagnosis. Consult a healthcare professional.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(
      (typeof error === "object" && error !== null && "message" in error
        ? (error as { message: string }).message
        : String(error)) || "Resend failed to deliver the email."
    );
  }
}

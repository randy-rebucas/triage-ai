"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import type { ITriageSession } from "@/types";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// ReportActions — Download PDF + Send to Email buttons
//
// PDF: generated client-side with jspdf (text-based, compressed)
//      → direct file download, no print dialog
// Email: modal with email input → POST /api/triage/[id]/email-report
// ─────────────────────────────────────────────────────────────────

interface ReportActionsProps {
  session: ITriageSession;
}

// ── PDF generation ─────────────────────────────────────────────
async function downloadPDF(session: ITriageSession) {
  // Dynamically import jspdf so it stays out of the initial bundle
  const { jsPDF } = await import("jspdf");

  const doc  = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const PAGE_W    = 210;
  const MARGIN    = 14;
  const LINE_W    = PAGE_W - MARGIN * 2;
  const LINE_H    = 6;
  let   y         = MARGIN;

  const { aiReport, safetyFlags, riskLevel, riskScore, chiefComplaint, createdAt } = session;

  // ── helpers ──────────────────────────────────────────────────
  function checkPage(needed = LINE_H) {
    if (y + needed > 280) { doc.addPage(); y = MARGIN; }
  }

  function heading1(text: string) {
    checkPage(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);   // blue-900
    doc.text(text, MARGIN, y);
    y += 8;
  }

  function heading2(text: string) {
    checkPage(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);    // gray-800
    doc.text(text, MARGIN, y);
    y += 6;
  }

  function body(text: string, indent = 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);    // gray-700
    const lines = doc.splitTextToSize(text, LINE_W - indent);
    lines.forEach((line: string) => {
      checkPage();
      doc.text(line, MARGIN + indent, y);
      y += LINE_H - 1;
    });
  }

  function label(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128); // gray-500
    checkPage(5);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 4;
  }

  function divider() {
    checkPage(4);
    doc.setDrawColor(229, 231, 235); // gray-200
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 4;
  }

  function bullet(text: string, color: [number, number, number] = [59, 130, 246]) {
    checkPage();
    doc.setFillColor(...color);
    doc.circle(MARGIN + 1.5, y - 1.5, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    const lines = doc.splitTextToSize(text, LINE_W - 6);
    lines.forEach((line: string, i: number) => {
      if (i > 0) checkPage();
      doc.text(line, MARGIN + 5, y);
      y += LINE_H - 1;
    });
  }

  // ── Cover / header ────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);   // blue-600
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Triage AI — Pre-Consultation Report", MARGIN, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text(
    createdAt ? `Generated: ${format(new Date(createdAt), "PPP 'at' p")}` : "Generated just now",
    MARGIN, 20,
  );
  doc.text(`Risk: ${riskLevel?.toUpperCase() ?? "—"}  |  Score: ${riskScore ?? 0}/100`, MARGIN, 25);
  y = 36;

  // ── Chief complaint ───────────────────────────────────────────
  heading1("Chief Complaint");
  body(chiefComplaint || "—");
  y += 2;
  divider();

  // ── Summary ───────────────────────────────────────────────────
  if (aiReport?.summary) {
    heading2("Assessment Summary");
    const s = aiReport.summary;
    if (s.duration) { label("Duration");  body(s.duration,  4); }
    if (s.severity) { label("Severity");  body(s.severity,  4); }
    if (s.onset)    { label("Onset");     body(s.onset,     4); }
    y += 2;
    divider();
  }

  // ── Safety flags ──────────────────────────────────────────────
  if (safetyFlags && safetyFlags.length > 0) {
    heading2("Attention Points");
    safetyFlags.forEach((f) => {
      const color: [number, number, number] =
        f.severity === "emergency" ? [220, 38, 38] :
        f.severity === "urgent"    ? [234, 88, 12] : [202, 138, 4];
      bullet(f.flag, color);
    });
    y += 2;
    divider();
  }

  // ── Possible conditions ───────────────────────────────────────
  if (aiReport?.possibleConditions && aiReport.possibleConditions.length > 0) {
    heading2("Areas of Concern");
    body("These are possible areas your clinician will evaluate — not a diagnosis.", 0);
    y += 1;
    aiReport.possibleConditions.forEach((c) => {
      checkPage(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(`${c.name}`, MARGIN + 2, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(`${c.likelihood} likelihood`, PAGE_W - MARGIN - 30, y);
      y += 4;
      if (c.description) body(c.description, 4);
      y += 1;
    });
    divider();
  }

  // ── Recommendations ───────────────────────────────────────────
  if (aiReport?.recommendations && aiReport.recommendations.length > 0) {
    heading2("Recommendations");
    aiReport.recommendations.forEach((r, i) => bullet(`${i + 1}. ${r}`));
    y += 2;
    divider();
  }

  // ── Red flags ─────────────────────────────────────────────────
  if (aiReport?.redFlags && aiReport.redFlags.length > 0) {
    heading2("Red Flags — Seek Care Promptly");
    aiReport.redFlags.forEach((f) => bullet(f, [220, 38, 38]));
    y += 2;
    divider();
  }

  // ── Follow-up ─────────────────────────────────────────────────
  if (aiReport?.followUpTimeframe) {
    heading2("Recommended Follow-up");
    body(aiReport.followUpTimeframe);
    y += 2;
    divider();
  }

  // ── Disclaimer ────────────────────────────────────────────────
  checkPage(16);
  doc.setFillColor(239, 246, 255); // blue-50
  doc.rect(MARGIN, y, LINE_W, 14, "F");
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 64, 175); // blue-800
  const disclaimer = aiReport?.disclaimer ||
    "This report was generated by an AI assistant to help your clinician understand your symptoms. It is NOT a medical diagnosis. Consult a healthcare professional for proper evaluation.";
  const dLines = doc.splitTextToSize(disclaimer, LINE_W - 4);
  dLines.forEach((line: string) => { doc.text(line, MARGIN + 2, y + 4); y += 4; });
  y += 6;

  // ── Page numbers ──────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text(`Triage AI Report  •  Page ${p} of ${totalPages}`, MARGIN, 293);
    doc.text("Confidential — For Clinical Use Only", PAGE_W - MARGIN, 293, { align: "right" });
  }

  const dateStamp = createdAt
    ? format(new Date(createdAt), "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  doc.save(`clinicai-report-${dateStamp}.pdf`);
}

export function ReportActions({ session }: ReportActionsProps) {
  const [modalOpen,    setModalOpen]    = useState(false);
  const [email,        setEmail]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [result,       setResult]       = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the email input when the modal opens
  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setResult(null);
      setEmail("");
    }
  }, [modalOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPDF(session);
    } finally {
      setDownloading(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setResult(null);

    try {
      const res  = await fetch(`/api/triage/${session._id}/email-report`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };

      if (res.ok) {
        setResult({ ok: true, message: data.message ?? `Report sent to ${email}` });
      } else {
        setResult({ ok: false, message: data.error ?? "Failed to send email. Please try again." });
      }
    } catch {
      setResult({ ok: false, message: "Network error. Please check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* ── Action bar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="text-sm font-semibold text-gray-800">Save or share your report</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Download a PDF copy or send it directly to your inbox.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:flex-shrink-0">
          <Button
            variant="outline"
            onClick={handleDownload}
            isLoading={downloading}
            aria-label="Download report as PDF"
            className="w-full sm:w-auto justify-center"
          >
            {!downloading && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                className="mr-1.5 h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            {downloading ? "Generating…" : "Download PDF"}
          </Button>

          <Button
            variant="primary"
            onClick={() => setModalOpen(true)}
            aria-label="Send report to email"
            className="w-full sm:w-auto justify-center"
          >
            {/* Email icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="mr-1.5 h-4 w-4" aria-hidden="true">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            Send to Email
          </Button>
        </div>
      </div>

      {/* Email modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-4 sm:p-6 animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 id="email-modal-title" className="text-lg font-bold text-gray-900">
                  Send Report by Email
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  A copy of your assessment summary will be sent to the address below.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="ml-4 flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label htmlFor="report-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="report-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending || result?.ok}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    disabled:bg-gray-50 disabled:text-gray-400 transition"
                />
              </div>

              {/* Feedback */}
              {result && (
                <div
                  role="alert"
                  className={`rounded-lg px-4 py-3 text-sm ${
                    result.ok
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  {result.ok ? "✓ " : "✗ "}{result.message}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-full sm:w-auto rounded-xl px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-600
                    hover:bg-gray-100 transition-colors text-center"
                >
                  {result?.ok ? "Close" : "Cancel"}
                </button>
                {!result?.ok && (
                  <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className="w-full sm:w-auto rounded-xl bg-blue-600 px-5 py-2.5 sm:py-2 text-sm font-semibold text-white
                      hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors flex items-center justify-center gap-2"
                  >
                    {sending && (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {sending ? "Sending…" : "Send Report"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

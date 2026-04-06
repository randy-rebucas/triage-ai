"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import type { ITriageSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// ReportActions — Download PDF + Send to Email buttons
//
// PDF: uses window.print() scoped to the #report-print-area div
//      (print CSS hides everything else)
// Email: modal with email input → POST /api/triage/[id]/email-report
// ─────────────────────────────────────────────────────────────────

interface ReportActionsProps {
  session: ITriageSession;
  /** Auth cookie is forwarded automatically by the browser */
}

export function ReportActions({ session }: ReportActionsProps) {
  const [modalOpen,    setModalOpen]    = useState(false);
  const [email,        setEmail]        = useState("");
  const [sending,      setSending]      = useState(false);
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

  function handlePrint() {
    window.print();
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
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={handlePrint}
            aria-label="Download report as PDF"
          >
            {/* Download / PDF icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="mr-1.5 h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download PDF
          </Button>

          <Button
            variant="primary"
            onClick={() => setModalOpen(true)}
            aria-label="Send report to email"
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
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 animate-slide-up">
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
                className="ml-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
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

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600
                    hover:bg-gray-100 transition-colors"
                >
                  {result?.ok ? "Close" : "Cancel"}
                </button>
                {!result?.ok && (
                  <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white
                      hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors flex items-center gap-2"
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

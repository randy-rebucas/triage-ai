"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { ISafetyFlag, ITriageSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// SymptomChat — Production AI chat interface for patient triage
//
// Supports three input modes per question:
//   • text     — free-form textarea (default)
//   • yes_no   — large tap-friendly Yes / No buttons
//   • slider   — 0–10 pain/severity rating with live colour feedback
// ─────────────────────────────────────────────────────────────────

type InputMode = "text" | "yes_no" | "slider";

interface Message {
  role: "assistant" | "patient";
  content: string;
  timestamp: Date;
}

export interface SymptomChatProps {
  onComplete: (session: ITriageSession) => void;
  tenantSlug?: string;
}

// ── Heuristic: pick the best input mode for an AI question ───────
function detectInputMode(question: string): InputMode {
  const q = question.toLowerCase();

  const yesNoTriggers =
    /^(do you|have you|are you|is there|did you|can you|were you|has |would you|does your|is your)/;

  if (
    yesNoTriggers.test(q) ||
    q.includes("yes or no") ||
    q.includes("(yes/no)") ||
    q.includes("do you have") ||
    q.includes("have you experienced") ||
    q.includes("any history of")
  ) {
    return "yes_no";
  }

  if (
    q.includes("scale of") ||
    q.includes("rate your") ||
    q.includes("0 to 10") ||
    q.includes("1 to 10") ||
    q.includes("pain level") ||
    q.includes("on a scale") ||
    (q.includes("scale") &&
      (q.includes("pain") || q.includes("severity") || q.includes("discomfort")))
  ) {
    return "slider";
  }

  return "text";
}

// ─── Sub-components ───────────────────────────────────────────────

/** Animated three-dot typing indicator */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5" aria-label="AI is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

/** Segmented progress bar (8 segments matching max questions) */
function ProgressSteps({ progress }: { progress: number }) {
  const SEGMENTS = 8;
  const filled = Math.round((progress / 100) * SEGMENTS);

  return (
    <div className="space-y-1.5" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Assessment progress</span>
        <span className="font-semibold text-blue-600">{progress}%</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-2 rounded-full transition-all duration-500 ${
              i < filled ? "bg-blue-500" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** 0–10 pain/severity range slider with live colour coding */
function PainSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const LABELS = ["None", "Mild", "Moderate", "Severe", "Worst"];
  const labelText = LABELS[Math.min(Math.floor(value / 2.5), 4)];

  const colour =
    value <= 3 ? "text-green-600" :
    value <= 6 ? "text-yellow-600" :
    value <= 8 ? "text-orange-600" : "text-red-600";

  const accentClass =
    value <= 3 ? "accent-green-500" :
    value <= 6 ? "accent-yellow-500" :
    value <= 8 ? "accent-orange-500" : "accent-red-500";

  return (
    <div className="space-y-3 py-1">
      {/* Numeric display */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">No pain</span>
        <div className="text-center">
          <span className={`text-4xl font-bold tabular-nums leading-none ${colour}`}>
            {value}
          </span>
          <span className="ml-1 text-sm text-gray-400">/10</span>
          <p className={`text-xs font-medium mt-0.5 ${colour}`}>{labelText}</p>
        </div>
        <span className="text-xs text-gray-400">Worst pain</span>
      </div>

      {/* Range track */}
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={`w-full h-2 rounded-full cursor-pointer disabled:cursor-not-allowed ${accentClass}`}
        aria-label={`Pain level: ${value} out of 10 — ${labelText}`}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
      />

      {/* Tick labels */}
      <div className="flex justify-between" aria-hidden="true">
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className={`text-[10px] w-4 text-center ${
              i === value ? "font-bold text-gray-800" : "text-gray-400"
            }`}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Large tap-friendly Yes / No buttons */
function YesNoButtons({
  selected,
  onSelect,
  disabled,
}: {
  selected: string | null;
  onSelect: (v: "Yes" | "No") => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex gap-3"
      role="group"
      aria-label="Select yes or no"
    >
      {(["Yes", "No"] as const).map((opt) => {
        const isSelected = selected === opt;
        const isYes = opt === "Yes";
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt)}
            aria-pressed={isSelected}
            className={`
              flex-1 flex flex-col items-center gap-1.5 rounded-2xl border-2 py-5 text-sm font-semibold
              transition-all duration-150
              focus:outline-none focus:ring-2 focus:ring-offset-2
              disabled:cursor-not-allowed disabled:opacity-50
              ${isSelected
                ? isYes
                  ? "border-green-500 bg-green-50 text-green-700 shadow-sm focus:ring-green-400"
                  : "border-red-400  bg-red-50  text-red-700  shadow-sm focus:ring-red-400"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 focus:ring-gray-300"
              }
            `}
          >
            <span className="text-xl leading-none" aria-hidden="true">
              {isYes ? "✓" : "✗"}
            </span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export function SymptomChat({ onComplete, tenantSlug }: SymptomChatProps) {
  const [step, setStep] = useState<"complaint" | "questions" | "processing">("complaint");

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm here to help gather information about how you're feeling before your doctor's appointment. Everything you share is confidential.\n\nPlease describe what's bothering you today in a few sentences.",
      timestamp: new Date(),
    },
  ]);

  const [input, setInput]                   = useState("");
  const [sliderValue, setSliderValue]       = useState(5);
  const [yesNoSelected, setYesNoSelected]   = useState<string | null>(null);
  const [inputMode, setInputMode]           = useState<InputMode>("text");

  const [isLoading, setIsLoading]           = useState(false);
  const [progress, setProgress]             = useState(0);
  const [sessionId, setSessionId]           = useState<string | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [safetyFlags, setSafetyFlags]       = useState<ISafetyFlag[]>([]);
  const [error, setError]                   = useState<string | null>(null);

  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the previous render was mid-load so we can detect the
  // isLoading true→false transition and auto-focus the correct input.
  const wasLoadingRef    = useRef(false);

  // Clean up pending timers on unmount
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  // Auto-focus the active input control once the AI finishes responding.
  // We detect the isLoading true → false transition so focus only fires
  // after the textarea/buttons are re-enabled (not while they're disabled).
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && step === "questions") {
      if (inputMode === "text") {
        // Tiny delay lets React flush the disabled→enabled prop before focus
        const t = setTimeout(() => textareaRef.current?.focus(), 60);
        wasLoadingRef.current = false;
        return () => clearTimeout(t);
      }
      // yes_no / slider — no keyboard focus needed; user taps visually
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, step, inputMode]);

  // Auto-scroll on new messages or while AI is typing
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Build request headers including tenant context
  const getHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (tenantSlug) h["x-tenant-slug"] = tenantSlug;
    return h;
  }, [tenantSlug]);

  const addMessage = (role: "assistant" | "patient", content: string) => {
    setMessages((prev) => [...prev, { role, content, timestamp: new Date() }]);
  };

  const resetInputState = () => {
    setInput("");
    setYesNoSelected(null);
    setSliderValue(5);
    setError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // ── Start triage session ───────────────────────────────────────
  const handleSubmitComplaint = async () => {
    if (!input.trim() || isLoading) return;
    const complaint = input.trim();

    if (complaint.length < 10) {
      setError("Please describe your symptoms in a bit more detail (at least 10 characters).");
      return;
    }

    resetInputState();
    addMessage("patient", complaint);
    setIsLoading(true);

    try {
      const res  = await fetch("/api/triage/start", {
        method:  "POST",
        headers: getHeaders(),
        body:    JSON.stringify({ chiefComplaint: complaint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start assessment");

      setSessionId(data.data.sessionId);
      setCurrentQuestionId(data.data.questionId);
      if (data.data.safetyFlags?.length > 0) setSafetyFlags(data.data.safetyFlags);

      addMessage("assistant", data.data.firstQuestion);

      if (data.data.isEmergency) {
        // Emergency fast-path — session already completed, jump straight to done
        setStep("processing");
        completeTimerRef.current = setTimeout(() => onComplete(data.data.session as ITriageSession), 3000);
      } else {
        const firstInputMode = data.data.inputType ?? detectInputMode(data.data.firstQuestion);
        setInputMode(firstInputMode);
        setStep("questions");
        setProgress(10);
        // Focus the textarea for the first question (text mode only)
        if (firstInputMode === "text") {
          setTimeout(() => textareaRef.current?.focus(), 60);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Submit an answer — streaming via SSE ──────────────────────
  const handleSubmitAnswer = useCallback(async (overrideAnswer?: string) => {
    let answer = overrideAnswer;

    if (answer === undefined) {
      if (inputMode === "slider") {
        answer = `${sliderValue} out of 10`;
      } else {
        if (!input.trim()) return;
        answer = input.trim();
      }
    }

    if (!answer || !sessionId || isLoading) return;

    resetInputState();
    addMessage("patient", answer);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/triage/${sessionId}/stream-answer`, {
        method:  "POST",
        headers: { ...getHeaders(), Accept: "text/event-stream" },
        body:    JSON.stringify({ answer, questionId: currentQuestionId }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to submit answer");
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let streamingMsgAdded = false;
      let streamingContent  = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const json = line.slice(6).trim();
        if (!json) return;

        let event: Record<string, unknown>;
        try { event = JSON.parse(json); } catch { return; }

        const type = event.type as string;

        if (type === "token" && typeof event.text === "string") {
          streamingContent += event.text;
          if (!streamingMsgAdded) {
            // Add placeholder message; subsequent tokens patch it in-place
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: streamingContent, timestamp: new Date() },
            ]);
            streamingMsgAdded = true;
          } else {
            // Patch the last message content
            setMessages((prev) => {
              const updated = [...prev];
              const last    = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: streamingContent };
              }
              return updated;
            });
          }
        }

        if (type === "meta") {
          // meta payload is nested: { type: "meta", meta: { questionId, inputType, progress, ... } }
          const meta       = (event.meta ?? event) as Record<string, unknown>;
          const questionId = meta.questionId as string | undefined;
          const inputType  = meta.inputType  as InputMode | undefined;
          const prog       = meta.progress   as number   | undefined;
          if (questionId) setCurrentQuestionId(questionId);
          if (prog != null) setProgress(prog);
          if (inputType) {
            setInputMode(inputType);
          } else if (streamingContent) {
            setInputMode(detectInputMode(streamingContent));
          }
          // Focus is handled by the wasLoadingRef useEffect once isLoading → false
        }

        if (type === "progress") {
          const msg = (event.message as string) || "Processing…";
          // Replace last assistant message with the current step label,
          // or add a new one if this is the first progress event
          setMessages((prev) => {
            const updated = [...prev];
            const last    = updated[updated.length - 1];
            if (last?.role === "assistant" && streamingMsgAdded) {
              updated[updated.length - 1] = { ...last, content: `⏳ ${msg}` };
            } else {
              updated.push({ role: "assistant", content: `⏳ ${msg}`, timestamp: new Date() });
              streamingMsgAdded = true;
            }
            return updated;
          });
        }

        if (type === "complete") {
          setStep("processing");
          const hasSession = Boolean(event.session);
          const finalMsg = hasSession
            ? "✅ Your assessment is complete. A clinician will review your responses and the AI-generated summary shortly.\n\nPlease do not make any medical decisions based on this assessment alone."
            : "⚠️ Your responses were saved but the report could not be generated right now. Please contact the clinic if you don't receive a follow-up.";
          setMessages((prev) => {
            const updated = [...prev];
            const last    = updated[updated.length - 1];
            if (last?.role === "assistant" && streamingMsgAdded) {
              updated[updated.length - 1] = { ...last, content: finalMsg };
            } else {
              updated.push({ role: "assistant", content: finalMsg, timestamp: new Date() });
            }
            return updated;
          });
          if (hasSession) {
            completeTimerRef.current = setTimeout(() => {
              onComplete(event.session as ITriageSession);
            }, 2000);
          }
        }

        if (type === "error") {
          throw new Error((event.message as string) || "Stream error");
        }
      };

      // Read the SSE stream line-by-line
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      // Flush remaining buffer
      for (const line of buf.split("\n")) processLine(line);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, sliderValue, input, sessionId, isLoading, currentQuestionId, getHeaders, onComplete]);

  const handleYesNo = (value: "Yes" | "No") => {
    setYesNoSelected(value);
    handleSubmitAnswer(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      step === "complaint" ? handleSubmitComplaint() : handleSubmitAnswer();
    }
  };

  const hasEmergencyFlags = safetyFlags.some((f) => f.severity === "emergency");
  const maxChars          = step === "complaint" ? 1000 : 500;
  const canSendText       = input.trim().length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Emergency alert ─────────────────────────────────────── */}
      {hasEmergencyFlags && (
        <div className="mb-4 flex-shrink-0">
          <Alert variant="emergency" title="Important Safety Notice">
            <p>Based on your description, some of your symptoms may require immediate medical attention.</p>
            <p className="mt-1 font-semibold">
              If you are experiencing a medical emergency, please call{" "}
              <span className="text-red-700">911</span> or go to the nearest emergency room immediately.
            </p>
          </Alert>
        </div>
      )}

      {/* ── Progress indicator ─────────────────────────────────── */}
      {step === "questions" && (
        <div className="mb-4 flex-shrink-0">
          <ProgressSteps progress={progress} />
        </div>
      )}

      {/* ── Message thread ─────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation with AI triage assistant"
      >
        {messages.map((msg, idx) => (
          <div
            key={`${msg.role}-${msg.timestamp.getTime()}-${idx}`}
            className={`flex ${msg.role === "patient" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            {msg.role === "assistant" && (
              <div
                aria-hidden="true"
                className="mr-2 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 select-none"
              >
                AI
              </div>
            )}

            <div className={`flex flex-col gap-0.5 max-w-[80%] ${msg.role === "patient" ? "items-end" : "items-start"}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "patient"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm"
                }`}
              >
                {msg.content.split("\n").map((line, i, arr) => (
                  <span key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </span>
                ))}
              </div>
              <time
                className="text-[10px] text-gray-400 px-1"
                dateTime={msg.timestamp.toISOString()}
                suppressHydrationWarning
              >
                {String(msg.timestamp.getHours()).padStart(2, "0")}:
                {String(msg.timestamp.getMinutes()).padStart(2, "0")}
              </time>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div
              aria-hidden="true"
              className="mr-2 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
            >
              AI
            </div>
            <div className="flex items-center rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="error" className="mb-3 flex-shrink-0">
          {error}
        </Alert>
      )}

      {/* ── Input area ─────────────────────────────────────────── */}
      {step !== "processing" && (
        <div className="flex-shrink-0 space-y-3">

          {/* Yes / No */}
          {step === "questions" && inputMode === "yes_no" && (
            <YesNoButtons
              selected={yesNoSelected}
              onSelect={handleYesNo}
              disabled={isLoading}
            />
          )}

          {/* Pain / severity slider */}
          {step === "questions" && inputMode === "slider" && (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <PainSlider
                value={sliderValue}
                onChange={setSliderValue}
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSubmitAnswer()}
                isLoading={isLoading}
                className="w-full mt-4"
                aria-label={`Submit pain rating of ${sliderValue} out of 10`}
              >
                Submit Rating — {sliderValue}/10
              </Button>
            </div>
          )}

          {/* ChatGPT-style unified input box */}
          {(step === "complaint" || (step === "questions" && inputMode === "text")) && (
            <div
              className={`flex flex-col rounded-2xl border bg-white shadow-sm transition-all duration-150
                focus-within:border-blue-300 focus-within:shadow-md
                ${isLoading ? "opacity-60 pointer-events-none" : "border-gray-200"}
              `}
            >
              {/* Auto-resizing textarea — no border/outline of its own */}
              <textarea
                ref={textareaRef}
                placeholder={
                  step === "complaint"
                    ? "Describe your symptoms or concern…"
                    : "Type your answer…"
                }
                value={input}
                onChange={(e) => {
                  if (e.target.value.length <= maxChars) {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                  }
                }}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
                aria-label={
                  step === "complaint"
                    ? "Describe your symptoms (minimum 10 characters)"
                    : "Your answer to the AI question"
                }
                className="w-full resize-none bg-transparent px-4 pt-4 pb-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                style={{ minHeight: "52px", maxHeight: "200px", overflowY: "auto" }}
              />

              {/* Bottom row: hint / char count  +  send button */}
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="min-h-[16px]">
                  {step === "complaint" && input.trim().length > 0 && input.trim().length < 10 ? (
                    <span className="text-[10px] text-orange-500">
                      {10 - input.trim().length} more character
                      {10 - input.trim().length !== 1 ? "s" : ""} needed
                    </span>
                  ) : input.length > maxChars * 0.7 ? (
                    <span className={`text-[10px] ${input.length > maxChars * 0.9 ? "text-orange-500" : "text-gray-400"}`}>
                      {input.length}/{maxChars}
                    </span>
                  ) : null}
                </div>

                {/* Arrow-up send button */}
                <button
                  type="button"
                  onClick={step === "complaint" ? handleSubmitComplaint : () => handleSubmitAnswer()}
                  disabled={!canSendText || isLoading}
                  aria-label="Send message"
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-150
                    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500
                    ${canSendText && !isLoading
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-300 cursor-not-allowed"
                    }
                  `}
                >
                  {isLoading ? (
                    <LoadingSpinner size="sm" color="current" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Legal disclaimer ────────────────────────────────────── */}
      <p className="mt-3 flex-shrink-0 text-center text-[11px] text-gray-400">
        ⚠ Not a medical diagnosis — a licensed clinician will review all results.
      </p>
    </div>
  );
}

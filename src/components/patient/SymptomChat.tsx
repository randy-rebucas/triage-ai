"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { ISafetyFlag, ITriageSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// SymptomChat — Patient-facing triage chat interface
// Simulates a conversation with the AI triage assistant.
// ─────────────────────────────────────────────────────────────────

interface Message {
  role: "assistant" | "patient";
  content: string;
  timestamp: Date;
}

interface SymptomChatProps {
  onComplete: (session: ITriageSession) => void;
}

export function SymptomChat({ onComplete }: SymptomChatProps) {
  const [step, setStep] = useState<"complaint" | "questions" | "processing">(
    "complaint"
  );
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm here to help gather information about how you're feeling before your doctor's appointment. Everything you share is confidential.\n\nPlease describe what's bothering you today in a few sentences.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [safetyFlags, setSafetyFlags] = useState<ISafetyFlag[]>([]);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (role: "assistant" | "patient", content: string) => {
    setMessages((prev) => [...prev, { role, content, timestamp: new Date() }]);
  };

  const handleSubmitComplaint = async () => {
    if (!input.trim() || isLoading) return;

    const complaint = input.trim();
    setInput("");
    addMessage("patient", complaint);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/triage/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chiefComplaint: complaint }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start assessment");
      }

      setSessionId(data.data.sessionId);
      setCurrentQuestionId(data.data.questionId);

      if (data.data.safetyFlags?.length > 0) {
        setSafetyFlags(data.data.safetyFlags);
      }

      addMessage("assistant", data.data.firstQuestion);
      setStep("questions");
      setProgress(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const answer = input.trim();
    setInput("");
    addMessage("patient", answer);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/triage/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, questionId: currentQuestionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit answer");
      }

      if (data.data.isComplete) {
        setStep("processing");
        addMessage(
          "assistant",
          "Thank you for sharing that information. I've completed your pre-consultation assessment. Your doctor will review your responses and the AI-generated summary shortly.\n\nPlease do not make any medical decisions based on this assessment alone."
        );
        setTimeout(() => {
          onComplete(data.data.session);
        }, 2000);
      } else {
        setCurrentQuestionId(data.data.nextQuestionId);
        setProgress(data.data.progress);
        addMessage("assistant", data.data.nextQuestion);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      step === "complaint" ? handleSubmitComplaint() : handleSubmitAnswer();
    }
  };

  const hasEmergencyFlags = safetyFlags.some(
    (f) => f.severity === "emergency"
  );

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-200px)]">
      {/* Emergency Alert */}
      {hasEmergencyFlags && (
        <div className="mb-4 flex-shrink-0">
          <Alert variant="emergency" title="Important Safety Notice">
            <p>
              Based on your description, some of your symptoms may require
              immediate medical attention.
            </p>
            <p className="mt-1 font-semibold">
              If you are experiencing a medical emergency, please call{" "}
              <span className="text-red-700">911</span> or go to the nearest
              emergency room immediately.
            </p>
          </Alert>
        </div>
      )}

      {/* Progress bar */}
      {step === "questions" && (
        <div className="mb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Assessment progress</span>
            <span className="text-xs font-medium text-blue-600">
              {progress}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "patient" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            {msg.role === "assistant" && (
              <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                AI
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "patient"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-900 rounded-bl-sm"
              }`}
            >
              {msg.content.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              AI
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3">
              <LoadingSpinner size="sm" color="gray" />
              <span className="text-xs text-gray-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <Alert variant="error" className="mb-3 flex-shrink-0">
          {error}
        </Alert>
      )}

      {/* Input area */}
      {step !== "processing" && (
        <div className="flex-shrink-0 flex gap-3 items-end">
          <div className="flex-1">
            <Textarea
              placeholder={
                step === "complaint"
                  ? "Describe your symptoms or concern..."
                  : "Type your answer..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              disabled={isLoading}
              className="resize-none"
            />
          </div>
          <Button
            onClick={
              step === "complaint"
                ? handleSubmitComplaint
                : handleSubmitAnswer
            }
            isLoading={isLoading}
            disabled={!input.trim()}
            className="mb-0 shrink-0"
          >
            Send
          </Button>
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-3 text-center text-xs text-gray-400 flex-shrink-0">
        This is an AI-assisted pre-consultation tool. It does not provide
        medical diagnoses or advice.
      </p>
    </div>
  );
}

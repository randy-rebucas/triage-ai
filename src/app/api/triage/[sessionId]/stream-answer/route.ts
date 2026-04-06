import { NextRequest } from "next/server";
import { withPatientAuth, type PatientRouteContext } from "@/lib/api/withPatientAuth";
import { getTenantId } from "@/lib/tenant";
import { triageAnswerSchema } from "@/lib/validations/schemas";
import { streamAnswer } from "@/services/triageService";
import type { IPatientJwtPayload } from "@/lib/auth/patientJwt";
import { rateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";

// ─────────────────────────────────────────────────────────────────
// POST /api/triage/[sessionId]/stream-answer
//
// Streaming variant of the answer route. Instead of returning a JSON
// response with the next question, it:
//
//   1. Validates and saves the patient's answer (same as /answer)
//   2. Calls OpenAI with stream: true using the delimited prompt format
//   3. Emits the next question token-by-token as SSE events
//   4. Emits a final "meta" event with inputType, questionId, progress
//   5. Emits a "done" event when complete
//
// SSE Event types:
//   data: {"type":"token","text":"H"}            ← question text fragments
//   data: {"type":"meta","questionId":"q_2",...} ← metadata after question
//   data: {"type":"complete","session":{...}}    ← final session (last question)
//   data: {"type":"error","message":"..."}       ← on failure
//
// Client must use fetch() + ReadableStream (not EventSource — no POST support).
// ─────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handler(
  req:     NextRequest,
  patient: IPatientJwtPayload,
  context: PatientRouteContext,
): Promise<Response> {
  // Rate-limit: same budget as the regular answer route
  const rl = rateLimit(`triage:answer:${patient.patientId}`, 60, 60 * 1000);
  if (!rl.allowed) {
    const headers = new Headers({ "Content-Type": "application/json" });
    applyRateLimitHeaders(headers, rl);
    headers.set("Retry-After", String(rl.retryAfter ?? 60));
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      { status: 429, headers },
    );
  }

  const params    = await context.params;
  const sessionId = params?.sessionId;
  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "Session ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const body   = await req.json().catch(() => null);
  const parsed = triageAnswerSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    return new Response(
      JSON.stringify({ error: "Validation error", details: issues }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  const tenantId = await getTenantId();
  if (!tenantId) {
    return new Response(
      JSON.stringify({ error: "Tenant context could not be resolved. Please reload and try again." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Build the SSE response stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = streamAnswer(
          sessionId,
          patient.patientId,
          parsed.data,
          tenantId,
        );

        for await (const event of gen) {
          controller.enqueue(sseEvent(event as Record<string, unknown>));
        }
      } catch (err) {
        console.error("[POST /api/triage/[sessionId]/stream-answer]", err);
        controller.enqueue(
          sseEvent({ type: "error", message: "Failed to process your answer. Please try again." }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache, no-transform",
      "Connection":                  "keep-alive",
      "X-Accel-Buffering":           "no",    // disable nginx buffering
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const POST = withPatientAuth(handler);

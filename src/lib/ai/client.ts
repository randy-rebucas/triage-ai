import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────────
// OpenAI Client — Singleton
// ─────────────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables.");
}

const openaiClient = new OpenAI({
  apiKey:     process.env.OPENAI_API_KEY,
  maxRetries: 0,      // Retries are handled by withRetry() in triageEngine — avoid stacking
  timeout:    60_000,
});

/** Full model — used for risk scoring and report generation (clinical accuracy) */
export const AI_MODEL      = process.env.OPENAI_MODEL      || "gpt-4o";
/** Fast model — used for extraction and questioning (speed matters here) */
export const AI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || "gpt-4o-mini";
// Use || fallback after parseInt to guard against NaN from bad env values
export const AI_MAX_TOKENS  = parseInt(process.env.OPENAI_MAX_TOKENS  || "2048", 10) || 2048;
export const AI_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE || "0.3") || 0.3;

export default openaiClient;

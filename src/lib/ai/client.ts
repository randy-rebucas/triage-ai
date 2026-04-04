import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────────
// OpenAI Client — Singleton
// ─────────────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables.");
}

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 60_000, // 60 second timeout
});

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
export const AI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS || "2048");
export const AI_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE || "0.3");

export default openaiClient;

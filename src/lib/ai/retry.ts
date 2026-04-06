// ─────────────────────────────────────────────────────────────────
// AI Retry — Exponential backoff with full jitter
//
// Designed for transient OpenAI errors:
//   429 rate limit / 500 server error / 503 overload / network blip
//
// Non-retryable errors (auth, context-length, schema failures) are
// re-thrown immediately without waiting.
// ─────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of total attempts (default 3) */
  maxAttempts?: number;
  /** Base delay for the exponential curve in ms (default 600) */
  baseDelayMs?: number;
  /** Hard cap on any single delay in ms (default 10 000) */
  maxDelayMs?:  number;
  /** Called before each retry; useful for logging */
  onRetry?:     (attempt: number, error: Error, delayMs: number) => void;
}

// Errors that indicate a permanent failure — don't waste retries on them
const NON_RETRYABLE = [
  /invalid_api_key/i,
  /context_length_exceeded/i,
  /\[AI:.+\] Response is not valid JSON/i,
  /\[AI:.+\] Schema validation failed/i,
  /Access denied/i,
  /not found/i,
  /billing/i,
];

function isNonRetryable(err: Error): boolean {
  return NON_RETRYABLE.some((re) => re.test(err.message));
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Execute `fn`, retrying on transient failures with exponential backoff
 * + full jitter (AWS-recommended algorithm to prevent thundering herd).
 *
 * @example
 * const result = await withRetry(
 *   () => openai.chat.completions.create({ ... }),
 *   { maxAttempts: 3, onRetry: (n, err) => console.warn(`Retry ${n}:`, err.message) }
 * );
 */
export async function withRetry<T>(
  fn:      () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 600,
    maxDelayMs  = 10_000,
    onRetry,
  } = options;

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Permanent failure — bail immediately
      if (isNonRetryable(lastError)) throw lastError;

      // No more attempts left
      if (attempt === maxAttempts) break;

      // Full jitter: random in [0, min(base * 2^(attempt-1), cap)]
      const cap   = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const delay = Math.floor(Math.random() * cap);

      onRetry?.(attempt, lastError, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

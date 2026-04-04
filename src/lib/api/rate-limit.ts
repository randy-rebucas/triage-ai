// ─────────────────────────────────────────────────────────────────
// In-memory sliding-window rate limiter
//
// Keyed by an arbitrary string (typically IP address + route).
// State is held per server process — sufficient for development and
// single-instance deploys. For multi-instance production, replace
// the store with Upstash Redis / Vercel KV.
// ─────────────────────────────────────────────────────────────────

interface WindowState {
  timestamps: number[];   // epoch ms of each request in the current window
  resetAt: number;        // epoch ms when the oldest entry expires
}

const store = new Map<string, WindowState>();

// Purge stale keys every 5 minutes to avoid unbounded memory growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, state] of store.entries()) {
      if (state.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;        // when the window resets (ISO 8601 via .toISOString())
  retryAfter?: number;  // seconds until allowed again (only when !allowed)
}

/**
 * Check and consume one token from the sliding window.
 *
 * @param key       Unique key for this caller+route combination, e.g. `${ip}:directory`
 * @param limit     Maximum requests allowed in the window
 * @param windowMs  Window duration in milliseconds (e.g. 60_000 for 1 minute)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let state = store.get(key);

  if (!state) {
    state = { timestamps: [], resetAt: now + windowMs };
    store.set(key, state);
  }

  // Drop timestamps outside the current window
  state.timestamps = state.timestamps.filter((t) => t > windowStart);

  // Update resetAt to when the oldest remaining entry expires
  state.resetAt =
    state.timestamps.length > 0
      ? state.timestamps[0] + windowMs
      : now + windowMs;

  if (state.timestamps.length >= limit) {
    // Rate limit exceeded
    const retryAfterMs = state.timestamps[0] + windowMs - now;
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: new Date(state.timestamps[0] + windowMs),
      retryAfter: Math.ceil(retryAfterMs / 1000),
    };
  }

  // Consume one token
  state.timestamps.push(now);

  return {
    allowed: true,
    limit,
    remaining: limit - state.timestamps.length,
    resetAt: new Date(state.resetAt),
  };
}

/**
 * Extract the client IP from Next.js request headers.
 * Tries the standard forwarded headers in priority order.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Attach the standard rate-limit headers to a Headers object.
 */
export function applyRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
): void {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", result.resetAt.toISOString());
}

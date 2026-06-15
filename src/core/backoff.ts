/**
 * Exponential backoff with optional jitter.
 *
 * WHY: retrying a failed remote *immediately* hammers an already-struggling
 * server and rarely helps. Exponentially spacing retries (with jitter to avoid
 * thundering-herd synchronization across many clients) gives the remote time to
 * recover while keeping total latency bounded by a cap.
 *
 * Two functions, by design:
 *  - `baseDelay`  — the deterministic, monotonic-non-decreasing schedule.
 *  - `computeDelay` — `baseDelay` with jitter applied, always within [0, cap].
 *
 * Property 3 (backoff monotonicity) is stated on `baseDelay`; jitter only ever
 * *reduces* a delay and is proven to stay within the cap.
 */
import type { BackoffOptions, JitterStrategy } from "../types.js";

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 100,
  capMs: 5000,
  factor: 2,
  jitter: "full",
};

/** Merge a partial backoff config with defaults. */
export function resolveBackoff(opts?: Partial<BackoffOptions>): BackoffOptions {
  return { ...DEFAULT_BACKOFF, ...(opts ?? {}) };
}

/**
 * Deterministic delay (ms) before retry number `n` (0-based: n=0 is the delay
 * before the 2nd attempt). Monotonic non-decreasing in `n` and clamped to cap.
 */
export function baseDelay(n: number, opts: BackoffOptions): number {
  if (n < 0) return 0;
  const raw = opts.baseMs * Math.pow(opts.factor, n);
  // Guard against Infinity/NaN from huge exponents.
  const safe = Number.isFinite(raw) ? raw : opts.capMs;
  return Math.min(opts.capMs, Math.max(0, safe));
}

/**
 * Apply jitter to a base delay using an injected RNG in [0,1).
 *  - "none"  → exactly the base delay.
 *  - "full"  → uniform in [0, base]            (AWS "full jitter").
 *  - "equal" → base/2 + uniform in [0, base/2] (AWS "equal jitter").
 *
 * In every case the result is within [0, cap] because base <= cap.
 */
export function applyJitter(
  base: number,
  jitter: JitterStrategy,
  random: () => number,
): number {
  switch (jitter) {
    case "none":
      return base;
    case "full":
      return random() * base;
    case "equal":
      return base / 2 + random() * (base / 2);
    default:
      return base;
  }
}

/** Convenience: base schedule + jitter for retry `n`. */
export function computeDelay(
  n: number,
  opts: BackoffOptions,
  random: () => number,
): number {
  return applyJitter(baseDelay(n, opts), opts.jitter, random);
}

/**
 * The resilient load orchestrator — the heart of the library.
 *
 * Sequence:
 *   1. Try the primary remote via the injected LoadFn.
 *   2. On failure (rejection OR a `null` resolution — MF2's loadRemote can
 *      resolve to null), retry up to `maxAttempts` with exponential backoff.
 *      EVERY retry carries a fresh cache-bust token so the retried import URL
 *      differs from the cached failure.
 *   3. Optionally, a per-attempt `timeoutMs` bounds how long a single attempt
 *      may block before it is treated as a failure and retried.
 *   4. Optionally, `retryIf(error, attempt)` can abort the retry loop early
 *      (e.g. for definitively non-retryable errors) and jump to the fallback.
 *   5. If all attempts fail and a fallback is pinned, load it. Otherwise throw a
 *      single typed RemoteLoadError. Either way the host never crashes.
 *
 * The function is intentionally side-effect-light and fully injectable so the
 * five correctness properties are testable with zero network and a fixed seed.
 */
import type {
  LoadFn,
  ResilientLoadOptions,
  RemoteId,
} from "../types.js";
import { RemoteLoadError } from "../types.js";
import { computeDelay, resolveBackoff } from "./backoff.js";
import { mintCacheBust as defaultMint } from "./cache-bust.js";
import { fallbackKind, resolveFallback } from "./fallback.js";
import { safeTelemetry } from "../telemetry/hooks.js";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Treat both a thrown error and a `null` module as a failed attempt. */
class NullRemoteError extends Error {
  constructor(remoteId: string) {
    super(`Remote "${remoteId}" resolved to null`);
  }
}

/**
 * Sentinel thrown (internally only) when a per-attempt timeout fires.
 * It is never surfaced to the caller — the loader converts it to a RetryEvent
 * with `timedOut: true`, and ultimately to a RemoteLoadError if all attempts
 * time out without a fallback.
 */
class AttemptTimeoutError extends Error {
  constructor(ms: number) {
    super(`Remote load attempt timed out after ${ms}ms`);
  }
}

/**
 * Race a load promise against an optional timeout.
 * Returns the load result unchanged when `timeoutMs` is absent or zero.
 */
function withTimeout<T>(
  promise: Promise<T | null>,
  timeoutMs: number | undefined,
): Promise<T | null> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T | null>((resolve, reject) => {
    const id = setTimeout(() => reject(new AttemptTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Load `remoteId` resiliently. Resolves with the module (primary or fallback) or
 * rejects with a RemoteLoadError. Never rejects with an untyped error.
 */
export async function resilientLoad<T>(
  remoteId: RemoteId,
  options: ResilientLoadOptions<T> & { load: LoadFn<T> },
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const backoff = resolveBackoff(options.backoff);
  const tel = safeTelemetry(options.telemetry);
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const mint = options.mintCacheBust ?? defaultMint;
  const load = options.load;
  const timeoutMs = options.timeoutMs;
  const retryIf = options.retryIf;

  let lastError: unknown;
  // How many primary attempts were actually made (may be < maxAttempts if
  // retryIf short-circuits the loop).
  let attemptsMade = 0;

  loop: for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    tel.onAttempt({ remoteId, attempt, maxAttempts });
    attemptsMade = attempt;
    // First attempt has no cache-bust; EVERY retry gets a fresh unique token.
    const cacheBust = attempt === 1 ? undefined : mint();
    try {
      const mod = await withTimeout(
        load(remoteId, { attempt, cacheBust, isFallback: false }),
        timeoutMs,
      );
      if (mod == null) throw new NullRemoteError(remoteId);
      tel.onSuccess({ remoteId, attempt, viaFallback: false });
      return mod;
    } catch (error) {
      lastError = error;
      const isLast = attempt === maxAttempts;
      const timedOut = error instanceof AttemptTimeoutError;
      if (!isLast) {
        // retryIf=false → abandon retry loop, fall through to fallback/give-up.
        if (retryIf !== undefined && !retryIf(error, attempt)) break loop;
        const delayMs = computeDelay(attempt - 1, backoff, random);
        tel.onRetry({
          remoteId,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          error,
          timedOut,
        });
        await sleep(delayMs);
      }
    }
  }

  // All primary attempts exhausted (or retryIf short-circuited).
  if (options.fallback !== undefined) {
    tel.onFallback({
      remoteId,
      attemptsMade,
      error: lastError,
      fallbackKind: fallbackKind(options.fallback),
    });
    try {
      const fb = await resolveFallback(options.fallback, load);
      tel.onSuccess({ remoteId, attempt: attemptsMade, viaFallback: true });
      return fb;
    } catch (fbError) {
      const err = new RemoteLoadError({
        remoteId,
        attempts: attemptsMade,
        cause: fbError,
        fallbackFailed: true,
      });
      tel.onGiveUp({ remoteId, attemptsMade, error: err });
      throw err;
    }
  }

  const err = new RemoteLoadError({
    remoteId,
    attempts: attemptsMade,
    cause: lastError,
  });
  tel.onGiveUp({ remoteId, attemptsMade, error: err });
  throw err;
}

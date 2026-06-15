/**
 * The resilient load orchestrator — the heart of the library.
 *
 * Sequence:
 *   1. Try the primary remote via the injected LoadFn.
 *   2. On failure (rejection OR a `null` resolution — MF2's loadRemote can
 *      resolve to null), retry up to `maxAttempts` with exponential backoff.
 *      EVERY retry carries a fresh cache-bust token so the retried import URL
 *      differs from the cached failure.
 *   3. If all attempts fail and a fallback is pinned, load it. Otherwise throw a
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

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    tel.onAttempt({ remoteId, attempt, maxAttempts });
    // First attempt has no cache-bust; EVERY retry gets a fresh unique token.
    const cacheBust = attempt === 1 ? undefined : mint();
    try {
      const mod = await load(remoteId, { attempt, cacheBust, isFallback: false });
      if (mod == null) throw new NullRemoteError(remoteId);
      tel.onSuccess({ remoteId, attempt, viaFallback: false });
      return mod;
    } catch (error) {
      lastError = error;
      const isLast = attempt === maxAttempts;
      if (!isLast) {
        const delayMs = computeDelay(attempt - 1, backoff, random);
        tel.onRetry({
          remoteId,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          error,
        });
        await sleep(delayMs);
      }
    }
  }

  // All primary attempts exhausted.
  if (options.fallback !== undefined) {
    tel.onFallback({
      remoteId,
      attemptsMade: maxAttempts,
      error: lastError,
      fallbackKind: fallbackKind(options.fallback),
    });
    try {
      const fb = await resolveFallback(options.fallback, load);
      tel.onSuccess({ remoteId, attempt: maxAttempts, viaFallback: true });
      return fb;
    } catch (fbError) {
      const err = new RemoteLoadError({
        remoteId,
        attempts: maxAttempts,
        cause: fbError,
        fallbackFailed: true,
      });
      tel.onGiveUp({ remoteId, attemptsMade: maxAttempts, error: err });
      throw err;
    }
  }

  const err = new RemoteLoadError({
    remoteId,
    attempts: maxAttempts,
    cause: lastError,
  });
  tel.onGiveUp({ remoteId, attemptsMade: maxAttempts, error: err });
  throw err;
}

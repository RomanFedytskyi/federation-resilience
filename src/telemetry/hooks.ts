/**
 * Telemetry — the ONLY observability surface.
 *
 * WHY a wrapper instead of calling hooks directly: a buggy telemetry hook must
 * never break a load. `safeTelemetry` swaps the caller's hooks for no-throw
 * wrappers, so an exception inside `onRetry` (etc.) is swallowed, not allowed to
 * abort the retry loop. We intentionally bundle NO tracing SDK — these five
 * generic load-lifecycle events are the entire contract.
 */
import type {
  AttemptEvent,
  FallbackEvent,
  GiveUpEvent,
  RetryEvent,
  SuccessEvent,
  TelemetryHooks,
} from "../types.js";

/** A fully-populated, never-throwing telemetry surface. */
export interface SafeTelemetry {
  onAttempt: (e: AttemptEvent) => void;
  onRetry: (e: RetryEvent) => void;
  onFallback: (e: FallbackEvent) => void;
  onSuccess: (e: SuccessEvent) => void;
  onGiveUp: (e: GiveUpEvent) => void;
}

const noop = (): void => {};

function guard<E>(fn?: (e: E) => void): (e: E) => void {
  if (!fn) return noop;
  return (e: E) => {
    try {
      fn(e);
    } catch {
      /* a throwing hook must never affect loading */
    }
  };
}

/** Wrap user-supplied hooks so every emit is safe and total. */
export function safeTelemetry(hooks?: TelemetryHooks): SafeTelemetry {
  return {
    onAttempt: guard(hooks?.onAttempt),
    onRetry: guard(hooks?.onRetry),
    onFallback: guard(hooks?.onFallback),
    onSuccess: guard(hooks?.onSuccess),
    onGiveUp: guard(hooks?.onGiveUp),
  };
}

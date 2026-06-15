/**
 * Idle fallback prefetch.
 *
 * WHY: failover should feel instant. If we wait until the primary remote has
 * already failed to *start* fetching the fallback, the user stares at a spinner
 * during the fallback's network round-trip. Warming the fallback during browser
 * idle time means the failover is served from cache.
 *
 * INVARIANT (Property 5 — non-interference): this path must NEVER block, throw,
 * or alter the primary load. It runs on requestIdleCallback (with a setTimeout
 * fallback for non-browser / unsupported environments), swallows all errors, and
 * shares no mutable state with the primary loader.
 */
import type {
  Fallback,
  LoadFn,
  PrefetchHandle,
  PrefetchOptions,
  RequestIdleCallbackLike,
} from "../types.js";
import { fallbackKind, resolveFallback } from "./fallback.js";

const DEFAULT_TIMEOUT = 2000;

/** Resolve a requestIdleCallback implementation, falling back to setTimeout. */
function resolveIdle(injected?: RequestIdleCallbackLike): RequestIdleCallbackLike {
  if (injected) return injected;
  const g = globalThis as unknown as { requestIdleCallback?: RequestIdleCallbackLike };
  if (typeof g.requestIdleCallback === "function") {
    return g.requestIdleCallback.bind(globalThis);
  }
  // setTimeout shim with the same structural deadline contract.
  return (cb, opts) =>
    setTimeout(
      () => cb({ didTimeout: true, timeRemaining: () => 0 }),
      Math.min(opts?.timeout ?? 1, 50),
    ) as unknown as number;
}

/**
 * Schedule a fallback warm during idle time. Returns a cancelable handle whose
 * `done` promise NEVER rejects. Errors are reported only via `onWarm({ok:false})`.
 *
 * `load` is the loader used for remote-id fallbacks; for function fallbacks it is
 * simply invoked. Note we deliberately do not return or expose the warmed module:
 * its only job is to populate the HTTP/module cache so the later real load is fast.
 */
export function schedulePrefetch<T>(
  load: LoadFn<T>,
  options: PrefetchOptions<T>,
): PrefetchHandle {
  const fb: Fallback<T> = options.fallback;
  const idle = resolveIdle(options.requestIdle);
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;

  let canceled = false;
  let settle!: () => void;
  const done = new Promise<void>((res) => (settle = res));

  const finish = (ok: boolean, error?: unknown): void => {
    if (canceled) return;
    try {
      options.onWarm?.(error === undefined ? { ok } : { ok, error });
    } catch {
      /* onWarm must not break anything */
    }
    settle();
  };

  const handle = idle(
    () => {
      if (canceled) {
        settle();
        return;
      }
      // Fire-and-forget; isolate every failure mode from the primary path.
      void (async () => {
        try {
          if (fallbackKind(fb) === "module") {
            await (fb as () => T | Promise<T>)();
          } else {
            await resolveFallback(fb, load);
          }
          finish(true);
        } catch (error) {
          finish(false, error);
        }
      })();
    },
    { timeout },
  );

  return {
    cancel: () => {
      if (canceled) return;
      canceled = true;
      const g = globalThis as unknown as { cancelIdleCallback?: (id: number) => void };
      try {
        g.cancelIdleCallback?.(handle as unknown as number);
      } catch {
        /* ignore */
      }
      // Also clear the setTimeout shim id if that path was used.
      try {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
      } catch {
        /* ignore */
      }
      settle();
    },
    done,
  };
}

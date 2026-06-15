/**
 * The five resilience properties, each shipped as a runtime-checkable function
 * returning { passed, detail }. These are the executable spec: the fast-check
 * property tests drive these same functions, and applications can call them in
 * CI to assert the guarantees against their own configuration.
 *
 *  1. Bounded termination   — the retry loop always halts within maxAttempts.
 *  2. Fallback safety        — exhausted load yields the pinned fallback OR a
 *                              typed RemoteLoadError; never an uncaught crash.
 *  3. Backoff monotonicity   — base delay is non-decreasing up to cap; jitter
 *                              stays within [0, cap].
 *  4. Cache-bust idempotence — a successful load returns the same module
 *                              regardless of how many busted retries preceded it.
 *  5. Prefetch non-interference — idle prefetch never blocks/alters the primary.
 */
import type {
  BackoffOptions,
  LoadContext,
  PropertyResult,
} from "../types.js";
import { RemoteLoadError } from "../types.js";
import { resilientLoad } from "../core/resilient-loader.js";
import { baseDelay, computeDelay, resolveBackoff } from "../core/backoff.js";
import { schedulePrefetch } from "../core/prefetch.js";

const pass = (detail: string): PropertyResult => ({ passed: true, detail });
const fail = (detail: string): PropertyResult => ({ passed: false, detail });

/** Sleep seam that never actually waits — keeps property checks instant. */
const instantSleep = (): Promise<void> => Promise.resolve();

/**
 * Property 1 — Bounded termination.
 * With a load that always fails and no fallback, the loop must fire exactly
 * `maxAttempts` attempts and reject with a RemoteLoadError reporting that count.
 */
export async function checkBoundedTermination(
  maxAttempts: number,
): Promise<PropertyResult> {
  const n = Math.max(1, Math.floor(maxAttempts));
  let attempts = 0;
  try {
    await resilientLoad("p1/remote", {
      maxAttempts: n,
      sleep: instantSleep,
      load: async () => {
        attempts++;
        throw new Error("always fails");
      },
    });
    return fail("expected rejection but load resolved");
  } catch (e) {
    if (!(e instanceof RemoteLoadError)) {
      return fail(`expected RemoteLoadError, got ${String(e)}`);
    }
    if (attempts !== n) {
      return fail(`expected exactly ${n} attempts, observed ${attempts}`);
    }
    if (e.attempts !== n) {
      return fail(`error.attempts=${e.attempts}, expected ${n}`);
    }
    return pass(`halted after exactly ${n} attempt(s) with RemoteLoadError`);
  }
}

/**
 * Property 2 — Fallback safety.
 * Primary always fails. With a fallback, the loader resolves to the fallback
 * value. Without one, it rejects with a RemoteLoadError (and nothing else).
 */
export async function checkFallbackSafety(
  maxAttempts: number,
  withFallback: boolean,
): Promise<PropertyResult> {
  const n = Math.max(1, Math.floor(maxAttempts));
  const sentinel = { __fallback: true } as const;
  try {
    const result = await resilientLoad<unknown>("p2/remote", {
      maxAttempts: n,
      sleep: instantSleep,
      load: async () => {
        throw new Error("primary down");
      },
      fallback: withFallback ? () => sentinel : undefined,
    });
    if (!withFallback) return fail("no fallback but load resolved");
    return result === sentinel
      ? pass("exhausted primary resolved to the pinned fallback")
      : fail("fallback resolved to the wrong value");
  } catch (e) {
    if (withFallback) return fail(`fallback present but threw: ${String(e)}`);
    return e instanceof RemoteLoadError
      ? pass("no fallback → deterministic RemoteLoadError, host intact")
      : fail(`expected RemoteLoadError, got ${String(e)}`);
  }
}

/**
 * Property 3 — Backoff monotonicity.
 * The deterministic base schedule is non-decreasing and clamped to cap; jittered
 * delays stay within [0, cap] for every jitter strategy.
 */
export function checkBackoffMonotonicity(
  opts: Partial<BackoffOptions>,
  steps: number,
  random: () => number = Math.random,
): PropertyResult {
  const cfg: BackoffOptions = resolveBackoff(opts);
  const k = Math.max(1, Math.floor(steps));
  let prev = -Infinity;
  for (let i = 0; i < k; i++) {
    const d = baseDelay(i, cfg);
    if (d < prev) {
      return fail(`base schedule decreased at step ${i}: ${prev} -> ${d}`);
    }
    if (d > cfg.capMs) {
      return fail(`base delay ${d} exceeded cap ${cfg.capMs} at step ${i}`);
    }
    prev = d;
    const j = computeDelay(i, cfg, random);
    if (j < 0 || j > cfg.capMs) {
      return fail(`jittered delay ${j} outside [0, ${cfg.capMs}] at step ${i}`);
    }
  }
  return pass(`monotone non-decreasing & within cap for ${k} step(s)`);
}

/**
 * Property 4 — Cache-bust idempotence.
 * A load that fails `precedingFailures` times then succeeds must return the SAME
 * canonical module identity, no matter how many busted retries preceded it, and
 * each retry must carry a distinct cache-bust token.
 */
export async function checkCacheBustIdempotence(
  precedingFailures: number,
): Promise<PropertyResult> {
  const fails = Math.max(0, Math.floor(precedingFailures));
  const canonical = { id: "the-module" };
  const busts: Array<string | undefined> = [];
  let calls = 0;
  const maxAttempts = fails + 1;

  const result = await resilientLoad("p4/remote", {
    maxAttempts,
    sleep: instantSleep,
    load: async (_id: string, ctx: LoadContext) => {
      busts.push(ctx.cacheBust);
      calls++;
      if (calls <= fails) throw new Error("transient");
      return canonical;
    },
  });

  if (result !== canonical) {
    return fail("returned module is not the canonical identity");
  }
  // First attempt has no bust; every retry must have a unique, defined token.
  const retryBusts = busts.slice(1);
  if (retryBusts.some((b) => b === undefined)) {
    return fail("a retry was issued without a cache-bust token");
  }
  if (new Set(retryBusts).size !== retryBusts.length) {
    return fail("cache-bust tokens were not all unique across retries");
  }
  return pass(
    `same module after ${fails} busted retr${fails === 1 ? "y" : "ies"}; ` +
      `${retryBusts.length} unique token(s)`,
  );
}

/**
 * Property 5 — Prefetch non-interference.
 * A prefetch whose fallback fails/throws must not affect a concurrent primary
 * load: the primary resolves to its own value, the primary loader is never
 * invoked by the prefetch, and the prefetch settles without rejecting.
 */
export async function checkPrefetchNonInterference(): Promise<PropertyResult> {
  const primaryValue = { id: "primary" };
  let primaryCalls = 0;
  let prefetchCalls = 0;

  // Immediate idle shim so the property check is instant and deterministic.
  const immediateIdle = (cb: (d: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
    cb({ didTimeout: true, timeRemaining: () => 0 });
    return 1;
  };

  let warmFailed = false;
  const handle = schedulePrefetch<typeof primaryValue>(
    async () => {
      prefetchCalls++;
      throw new Error("fallback warm fails");
    },
    {
      fallback: "p5/fallback",
      requestIdle: immediateIdle,
      onWarm: (r) => {
        warmFailed = !r.ok;
      },
    },
  );

  const primary = await resilientLoad("p5/remote", {
    maxAttempts: 3,
    sleep: instantSleep,
    load: async () => {
      primaryCalls++;
      return primaryValue;
    },
  });

  await handle.done; // never rejects

  if (primary !== primaryValue) return fail("primary result was altered");
  if (primaryCalls !== 1) return fail(`primary invoked ${primaryCalls} times, expected 1`);
  if (prefetchCalls < 1) return fail("prefetch never ran");
  if (!warmFailed) return fail("prefetch failure was not isolated/reported");
  return pass("prefetch failure isolated; primary load unaffected");
}

/** Run all five properties with representative inputs; handy for a smoke check. */
export async function checkAllProperties(): Promise<
  Record<string, PropertyResult>
> {
  return {
    boundedTermination: await checkBoundedTermination(3),
    fallbackSafety: await checkFallbackSafety(3, true),
    backoffMonotonicity: checkBackoffMonotonicity({}, 8),
    cacheBustIdempotence: await checkCacheBustIdempotence(2),
    prefetchNonInterference: await checkPrefetchNonInterference(),
  };
}

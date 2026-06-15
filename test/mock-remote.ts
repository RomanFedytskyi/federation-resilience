/**
 * Scriptable in-memory remote simulator for tests and the benchmark harness.
 *
 * Zero network: every "load" is just a promise that resolves/rejects per the
 * script. It records each call's cache-bust token so tests can assert that every
 * retry is busted and that tokens are unique.
 *
 * Modes:
 *  - "transient-fail":   fail the first `failures` attempts, then succeed.
 *  - "permanent-outage": always fail (simulates a remote that is fully down/500).
 *  - "slow":             succeed but only after a per-attempt latency (ms).
 *  - "flapping":         deterministically alternate fail/succeed.
 */
import type { LoadContext, LoadFn } from "../src/types.js";

export type MockMode =
  | "transient-fail"
  | "permanent-outage"
  | "slow"
  | "flapping";

export interface MockScript {
  mode: MockMode;
  /** transient-fail: how many leading attempts fail. Default 1. */
  failures?: number;
  /** slow: latency in ms applied per attempt (uses the injected sleep). Default 50. */
  latencyMs?: number;
  /** The module value returned on success. Default a stable sentinel object. */
  module?: unknown;
  /** flapping: whether the FIRST attempt fails. Default true. */
  firstFails?: boolean;
  /** Error factory for failures. Default a 500-like Error. */
  error?: (attempt: number) => unknown;
}

export interface MockCall {
  remoteId: string;
  attempt: number;
  cacheBust: string | undefined;
  isFallback: boolean;
  outcome: "success" | "fail";
}

export interface MockRemote<T = unknown> {
  /** The LoadFn to inject into resilientLoad / loadResilientRemote. */
  load: LoadFn<T>;
  /** Every observed call, in order. */
  readonly calls: MockCall[];
  /** Reset the internal attempt counter and call log. */
  reset: () => void;
  /** The canonical success module (identity-stable for idempotence checks). */
  readonly module: T;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Build a mock remote. `sleep` is injectable so unit tests run instantly while
 * the benchmark can use a real clock to measure recovery latency.
 */
export function createMockRemote<T = unknown>(
  script: MockScript,
  sleep: (ms: number) => Promise<void> = realSleep,
): MockRemote<T> {
  const calls: MockCall[] = [];
  const moduleValue = (script.module ?? { __mock: true }) as T;
  const errorOf =
    script.error ?? ((a: number) => new Error(`remote 500 (attempt ${a})`));
  let n = 0;

  const decideFail = (attempt: number): boolean => {
    switch (script.mode) {
      case "permanent-outage":
        return true;
      case "transient-fail":
        return attempt <= (script.failures ?? 1);
      case "slow":
        return false;
      case "flapping": {
        const firstFails = script.firstFails ?? true;
        // attempt 1 -> firstFails; then alternate.
        return firstFails ? attempt % 2 === 1 : attempt % 2 === 0;
      }
    }
  };

  const load: LoadFn<T> = async (remoteId: string, ctx: LoadContext) => {
    n += 1;
    const attempt = ctx.attempt;
    if (script.mode === "slow") {
      await sleep(script.latencyMs ?? 50);
    }
    const willFail = decideFail(attempt);
    calls.push({
      remoteId,
      attempt,
      cacheBust: ctx.cacheBust,
      isFallback: ctx.isFallback,
      outcome: willFail ? "fail" : "success",
    });
    if (willFail) throw errorOf(attempt);
    return moduleValue;
  };

  return {
    load,
    calls,
    reset: () => {
      n = 0;
      calls.length = 0;
    },
    get module() {
      return moduleValue;
    },
  };
}

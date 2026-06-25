/**
 * Turns an example scenario file (data/README.md schema) into a LoadFn that
 * the resilient loader can drive. It simulates a real remote with REAL wall-clock
 * latency (so the measured time-to-recover in the UI is genuine), failing per the
 * per-attempt outcome script and recovering on the scripted success attempt.
 *
 * This stands in for an actual federated `loadRemote` so the demo runs with no
 * second app to build. In a real host you would NOT pass `load`; you'd let the
 * default Module Federation loader handle it.
 */
import type { LoadFn, LoadContext, ResilientLoadOptions } from "federation-resilience";
import checkoutScenario  from "../scenarios/storefront-checkout.example.json";
import timeoutScenario   from "../scenarios/timeout-recovery.example.json";
import retrySkipScenario from "../scenarios/retry-skip-404.example.json";

export interface CartModule {
  source: "primary" | "fallback";
  label: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Marker error for a simulated 404 — used by the retryIf demo. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor() { super("404 Not Found — remote moved or deleted"); }
}

type ScenarioFile = typeof checkoutScenario;

export function makeScenarioLoad(scenario: ScenarioFile): LoadFn<CartModule> {
  return async (_remoteId: string, ctx: LoadContext) => {
    if (ctx.isFallback) {
      const fb = scenario.fallback ?? { outcome: "succeed", latencyMs: 140 };
      await delay(fb.latencyMs);
      if (fb.outcome !== "succeed") throw new Error("fallback failed");
      return { source: "fallback", label: "Stable Cart (fallback remote)" };
    }
    const spec =
      scenario.attempts[Math.min(ctx.attempt - 1, scenario.attempts.length - 1)];
    await delay(spec.latencyMs);
    if (spec.outcome === "succeed") {
      return { source: "primary", label: "Cart (primary remote, recovered)" };
    }
    // In the retry-skip-404 scenario the first failure is treated as a 404.
    if (scenario.name === "retry-skip-404") {
      throw new NotFoundError();
    }
    // 'fail' and 'timeout' both surface as a generic load failure.
    throw new Error(`remote ${spec.outcome} (attempt ${ctx.attempt})`);
  };
}

// ---------------------------------------------------------------------------
// Demo scenario descriptors
// ---------------------------------------------------------------------------

export type DemoId = "fail-recover" | "timeout" | "retry-if";

export interface Demo {
  id: DemoId;
  label: string;
  description: string;
  scenario: ScenarioFile;
  /** Extra options merged into ResilientLoadOptions for this demo. */
  extraOptions: Partial<ResilientLoadOptions<CartModule>>;
}

export const DEMOS: Demo[] = [
  {
    id: "fail-recover",
    label: "Fail → recover",
    description:
      "Primary remote fails twice (500/timeout), then recovers on attempt 3. " +
      "Every retry carries a fresh cache-bust token to defeat Chromium's sticky failed-import cache.",
    scenario: checkoutScenario,
    extraOptions: {},
  },
  {
    id: "timeout",
    label: "Per-attempt timeout",
    description:
      "Primary remote hangs indefinitely. `timeoutMs: 800` bounds each attempt, " +
      "so the retry loop is never blocked. Notice `[retry timedOut]` in the telemetry.",
    scenario: timeoutScenario,
    extraOptions: {
      timeoutMs: 800, // abort each hanging attempt after 800ms
    },
  },
  {
    id: "retry-if",
    label: "retryIf — skip 404",
    description:
      "Primary remote returns a 404 (definitively non-retryable). `retryIf` returns " +
      "false on a NotFoundError, skipping all remaining retries and going straight to the fallback.",
    scenario: retrySkipScenario,
    extraOptions: {
      retryIf: (err) => !(err instanceof NotFoundError),
    },
  },
];

// Parallel-remotes demo uses its own set of scripted LoadFns (no scenario file needed).
export interface RemoteSpec {
  id: string;
  label: string;
  failAttempts: number; // how many times the primary fails before succeeding
  latencyMs: number;
  fallbackLatencyMs: number;
}

export const PARALLEL_REMOTES: RemoteSpec[] = [
  { id: "checkout/Cart",     label: "Cart",          failAttempts: 0, latencyMs: 180, fallbackLatencyMs: 140 },
  { id: "nav/Menu",          label: "Nav",           failAttempts: 2, latencyMs: 220, fallbackLatencyMs: 160 },
  { id: "promo/Banner",      label: "Promo banner",  failAttempts: 9, latencyMs: 150, fallbackLatencyMs: 130 }, // always fails → fallback
  { id: "reviews/Widget",    label: "Reviews",       failAttempts: 1, latencyMs: 200, fallbackLatencyMs: 155 },
];

export function makeParallelLoad(spec: RemoteSpec): LoadFn<CartModule> {
  let calls = 0;
  return async (_id: string, ctx: LoadContext) => {
    if (ctx.isFallback) {
      await delay(spec.fallbackLatencyMs);
      return { source: "fallback", label: `${spec.label} (fallback)` };
    }
    calls++;
    await delay(spec.latencyMs);
    if (calls <= spec.failAttempts) throw new Error("transient");
    return { source: "primary", label: `${spec.label} (primary)` };
  };
}

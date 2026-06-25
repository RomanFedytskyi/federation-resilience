/**
 * Shared scenario definitions and scripted LoadFns for the Vue demo.
 * Mirrors the react-host approach: real wall-clock latency so time-to-recover
 * measurements are genuine, but no actual second app needed.
 */
import type { LoadFn, LoadContext } from "federation-resilience";

export interface CartModule {
  source: "primary" | "fallback";
  label: string;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Marker error for a simulated 404. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor() { super("404 Not Found — remote moved or deleted"); }
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

export interface ScenarioAttempt {
  outcome: "fail" | "timeout" | "succeed";
  latencyMs: number;
}

export interface ScenarioDef {
  id: string;
  label: string;
  description: string;
  remoteId: string;
  fallbackId: string;
  maxAttempts: number;
  timeoutMs?: number;
  retryIf?: (err: unknown) => boolean;
  attempts: ScenarioAttempt[];
  fallback: ScenarioAttempt;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "fail-recover",
    label: "Fail → recover",
    description: "Primary fails twice then recovers. Every retry carries a fresh cache-bust token.",
    remoteId: "checkout/Cart",
    fallbackId: "checkout-stable/Cart",
    maxAttempts: 4,
    attempts: [
      { outcome: "fail",    latencyMs: 210 },
      { outcome: "timeout", latencyMs: 400 },
      { outcome: "succeed", latencyMs: 165 },
    ],
    fallback: { outcome: "succeed", latencyMs: 140 },
  },
  {
    id: "timeout",
    label: "Per-attempt timeout",
    description: "Primary hangs indefinitely. timeoutMs: 800 bounds each attempt — notice [retry-timeout] in the log.",
    remoteId: "checkout/Cart",
    fallbackId: "checkout-stable/Cart",
    maxAttempts: 4,
    timeoutMs: 800,
    attempts: [
      { outcome: "timeout", latencyMs: 9999 },
      { outcome: "timeout", latencyMs: 9999 },
      { outcome: "succeed", latencyMs: 160 },
    ],
    fallback: { outcome: "succeed", latencyMs: 140 },
  },
  {
    id: "retry-if",
    label: "retryIf — skip 404",
    description: "Primary returns a 404. retryIf skips all retries and jumps straight to the fallback.",
    remoteId: "checkout/Cart",
    fallbackId: "checkout-stable/Cart",
    maxAttempts: 4,
    retryIf: (err) => !(err instanceof NotFoundError),
    attempts: [
      { outcome: "fail", latencyMs: 80 },
    ],
    fallback: { outcome: "succeed", latencyMs: 130 },
  },
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeLoad(scenario: ScenarioDef): LoadFn<CartModule> {
  return async (_id: string, ctx: LoadContext) => {
    if (ctx.isFallback) {
      await delay(scenario.fallback.latencyMs);
      if (scenario.fallback.outcome !== "succeed") throw new Error("fallback failed");
      return { source: "fallback", label: "Stable Cart (fallback remote)" };
    }
    const spec = scenario.attempts[Math.min(ctx.attempt - 1, scenario.attempts.length - 1)]!;
    await delay(spec.latencyMs);
    if (spec.outcome === "succeed") return { source: "primary", label: "Cart (primary remote)" };
    if (scenario.id === "retry-if") throw new NotFoundError();
    throw new Error(`remote ${spec.outcome} (attempt ${ctx.attempt})`);
  };
}

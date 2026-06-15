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
import type { LoadFn, LoadContext } from "federation-resilience";
import scenario from "../scenarios/storefront-checkout.example.json";

export interface CartModule {
  source: "primary" | "fallback";
  label: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const exampleScenario = scenario;

export function makeScenarioLoad(): LoadFn<CartModule> {
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
    // 'fail' and 'timeout' both surface as a load failure.
    throw new Error(`remote ${spec.outcome} (attempt ${ctx.attempt})`);
  };
}

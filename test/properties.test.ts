/**
 * One fast-check property test PER resilience property, each pinned to a FIXED
 * seed for bit-for-bit reproducibility. These drive the same checkable functions
 * that ship in src/properties/properties.ts.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  checkBoundedTermination,
  checkFallbackSafety,
  checkBackoffMonotonicity,
  checkCacheBustIdempotence,
  checkPrefetchNonInterference,
} from "../src/properties/properties.js";

// Single fixed seed used by every property test below.
const SEED = 0x5eed;
const RUNS = 200;

describe("Property 1 — bounded termination", () => {
  it("always halts within maxAttempts (fixed seed)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (maxAttempts) => {
        const r = await checkBoundedTermination(maxAttempts);
        return r.passed;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("Property 2 — fallback safety", () => {
  it("yields fallback or a typed error, never a crash (fixed seed)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        async (maxAttempts, withFallback) => {
          const r = await checkFallbackSafety(maxAttempts, withFallback);
          return r.passed;
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("Property 3 — backoff monotonicity", () => {
  it("base schedule non-decreasing & jitter within cap (fixed seed)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // baseMs
        fc.integer({ min: 1000, max: 60000 }), // capMs
        fc.integer({ min: 1, max: 5 }), // factor
        fc.constantFrom("none", "full", "equal"), // jitter
        fc.integer({ min: 1, max: 20 }), // steps
        fc.double({ min: 0, max: 0.9999, noNaN: true }), // deterministic RNG value
        (baseMs, capMs, factor, jitter, steps, rngVal) => {
          const r = checkBackoffMonotonicity(
            { baseMs, capMs, factor, jitter: jitter as "none" | "full" | "equal" },
            steps,
            () => rngVal,
          );
          return r.passed;
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("Property 4 — cache-bust idempotence", () => {
  it("same module regardless of busted retries (fixed seed)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 10 }), async (failures) => {
        const r = await checkCacheBustIdempotence(failures);
        return r.passed;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("Property 5 — prefetch non-interference", () => {
  it("idle prefetch never blocks or alters the primary (fixed seed)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const r = await checkPrefetchNonInterference();
        return r.passed;
      }),
      { seed: SEED, numRuns: 50 },
    );
  });
});

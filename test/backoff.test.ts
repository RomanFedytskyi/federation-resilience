import { describe, expect, it } from "vitest";
import {
  baseDelay,
  applyJitter,
  computeDelay,
  resolveBackoff,
  DEFAULT_BACKOFF,
} from "../src/core/backoff.js";

describe("backoff", () => {
  it("resolveBackoff merges defaults", () => {
    expect(resolveBackoff()).toEqual(DEFAULT_BACKOFF);
    expect(resolveBackoff({ baseMs: 5 }).baseMs).toBe(5);
    expect(resolveBackoff({ baseMs: 5 }).capMs).toBe(DEFAULT_BACKOFF.capMs);
  });

  it("baseDelay grows exponentially then clamps to cap", () => {
    const cfg = resolveBackoff({ baseMs: 100, capMs: 800, factor: 2 });
    expect(baseDelay(0, cfg)).toBe(100);
    expect(baseDelay(1, cfg)).toBe(200);
    expect(baseDelay(2, cfg)).toBe(400);
    expect(baseDelay(3, cfg)).toBe(800);
    expect(baseDelay(4, cfg)).toBe(800); // clamped
    expect(baseDelay(50, cfg)).toBe(800); // huge exponent -> cap, not Infinity
  });

  it("baseDelay handles negative n", () => {
    expect(baseDelay(-1, resolveBackoff())).toBe(0);
  });

  it("applyJitter strategies stay within [0, base]", () => {
    const base = 1000;
    expect(applyJitter(base, "none", () => 0.5)).toBe(1000);
    expect(applyJitter(base, "full", () => 0.5)).toBe(500);
    expect(applyJitter(base, "equal", () => 0.5)).toBe(750);
    expect(applyJitter(base, "full", () => 0)).toBe(0);
    expect(applyJitter(base, "equal", () => 1)).toBe(1000);
    // unknown strategy falls back to base
    expect(applyJitter(base, "weird" as "none", () => 0.5)).toBe(1000);
  });

  it("computeDelay composes base + jitter", () => {
    const cfg = resolveBackoff({ baseMs: 100, capMs: 5000, factor: 2, jitter: "full" });
    expect(computeDelay(2, cfg, () => 0.5)).toBe(200); // base(2)=400, full*0.5=200
  });
});

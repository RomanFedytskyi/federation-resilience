import { describe, expect, it, vi } from "vitest";
import { resilientLoad } from "../src/core/resilient-loader.js";
import { RemoteLoadError } from "../src/types.js";
import { createMockRemote } from "./mock-remote.js";

const instant = () => Promise.resolve();

describe("resilientLoad", () => {
  it("returns immediately on a first-attempt success (no bust)", async () => {
    const mock = createMockRemote({ mode: "transient-fail", failures: 0 });
    const mod = await resilientLoad("a/Mod", { load: mock.load, sleep: instant });
    expect(mod).toBe(mock.module);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]!.cacheBust).toBeUndefined();
  });

  it("recovers from transient failures and busts every retry", async () => {
    const mock = createMockRemote({ mode: "transient-fail", failures: 2 });
    const tel = { onAttempt: vi.fn(), onRetry: vi.fn(), onSuccess: vi.fn() };
    const mod = await resilientLoad("a/Mod", {
      load: mock.load,
      maxAttempts: 5,
      sleep: instant,
      telemetry: tel,
    });
    expect(mod).toBe(mock.module);
    expect(mock.calls).toHaveLength(3);
    // attempt 1 no bust; attempts 2 & 3 each have a distinct token
    const busts = mock.calls.map((c) => c.cacheBust);
    expect(busts[0]).toBeUndefined();
    expect(busts[1]).toBeDefined();
    expect(busts[2]).toBeDefined();
    expect(busts[1]).not.toBe(busts[2]);
    expect(tel.onRetry).toHaveBeenCalledTimes(2);
    expect(tel.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ viaFallback: false }),
    );
  });

  it("treats a null resolution as a failed attempt", async () => {
    let n = 0;
    const mod = await resilientLoad<{ ok: boolean }>("n/Mod", {
      maxAttempts: 2,
      sleep: instant,
      load: async () => (++n === 1 ? null : { ok: true }),
    });
    expect(mod).toEqual({ ok: true });
    expect(n).toBe(2);
  });

  it("loads a function fallback when all attempts fail", async () => {
    const mock = createMockRemote({ mode: "permanent-outage" });
    const tel = { onFallback: vi.fn(), onGiveUp: vi.fn() };
    const fb = { fromFallback: true };
    const mod = await resilientLoad("down/Mod", {
      load: mock.load,
      maxAttempts: 3,
      sleep: instant,
      fallback: () => fb,
      telemetry: tel,
    });
    expect(mod).toBe(fb);
    expect(mock.calls).toHaveLength(3);
    expect(tel.onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackKind: "module", attemptsMade: 3 }),
    );
    expect(tel.onGiveUp).not.toHaveBeenCalled();
  });

  it("loads a remote-id fallback via the same LoadFn", async () => {
    const calls: string[] = [];
    const fbModule = { id: "stable" };
    const load = async (id: string, ctx: { isFallback: boolean }) => {
      calls.push(`${id}:${ctx.isFallback}`);
      if (!ctx.isFallback) throw new Error("primary down");
      return fbModule;
    };
    const mod = await resilientLoad("p/Mod", {
      load,
      maxAttempts: 2,
      sleep: instant,
      fallback: "stable/Mod",
    });
    expect(mod).toBe(fbModule);
    expect(calls).toContain("stable/Mod:true");
  });

  it("throws a typed RemoteLoadError when there is no fallback", async () => {
    const mock = createMockRemote({ mode: "permanent-outage" });
    const tel = { onGiveUp: vi.fn() };
    await expect(
      resilientLoad("down/Mod", {
        load: mock.load,
        maxAttempts: 4,
        sleep: instant,
        telemetry: tel,
      }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
    expect(tel.onGiveUp).toHaveBeenCalledTimes(1);
    const ev = tel.onGiveUp.mock.calls[0]![0];
    expect(ev.attemptsMade).toBe(4);
    expect(ev.error.attempts).toBe(4);
    expect(ev.error.fallbackFailed).toBe(false);
  });

  it("wraps a failing fallback in RemoteLoadError(fallbackFailed)", async () => {
    const mock = createMockRemote({ mode: "permanent-outage" });
    try {
      await resilientLoad("down/Mod", {
        load: mock.load,
        maxAttempts: 2,
        sleep: instant,
        fallback: () => {
          throw new Error("fallback also down");
        },
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RemoteLoadError);
      expect((e as RemoteLoadError).fallbackFailed).toBe(true);
    }
  });

  it("clamps maxAttempts to >= 1", async () => {
    const mock = createMockRemote({ mode: "permanent-outage" });
    await expect(
      resilientLoad("d/Mod", { load: mock.load, maxAttempts: 0, sleep: instant }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
    expect(mock.calls).toHaveLength(1);
  });

  it("delays between retries via the injected sleep with growing backoff", async () => {
    const mock = createMockRemote({ mode: "transient-fail", failures: 2 });
    const delays: number[] = [];
    await resilientLoad("a/Mod", {
      load: mock.load,
      maxAttempts: 5,
      backoff: { baseMs: 10, capMs: 1000, factor: 2, jitter: "none" },
      sleep: async (ms) => {
        delays.push(ms);
      },
      random: () => 0.5,
    });
    expect(delays).toEqual([10, 20]); // base*2^0, base*2^1, no jitter
  });
});

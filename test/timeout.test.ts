import { describe, expect, it, vi } from "vitest";
import { resilientLoad } from "../src/core/resilient-loader.js";
import { RemoteLoadError } from "../src/types.js";

const instant = () => Promise.resolve();

describe("timeoutMs", () => {
  it("resolves normally when the load settles before the timeout", async () => {
    const module = { ok: true };
    const mod = await resilientLoad("t/Fast", {
      load: async () => module,
      timeoutMs: 5000,
      sleep: instant,
    });
    expect(mod).toBe(module);
  });

  it("treats a hanging load as a failure and retries", async () => {
    let calls = 0;
    // First attempt hangs; second succeeds immediately.
    const module = { ok: true };
    const load = vi.fn(async (_id: string, ctx: { attempt: number }) => {
      calls++;
      if (ctx.attempt === 1) {
        // Hang forever — the timeout will fire.
        await new Promise<void>(() => {}); // intentionally never resolves
      }
      return module;
    });

    // Use a real (but short) timeout and real sleep so the race actually fires.
    // We inject a sleep that resolves instantly so the test stays fast.
    const mod = await resilientLoad<typeof module>("t/Hang", {
      load,
      maxAttempts: 3,
      timeoutMs: 10,
      sleep: instant,
    });
    expect(mod).toBe(module);
    expect(calls).toBe(2);
  });

  it("fires onRetry with timedOut=true when the timeout fires", async () => {
    const onRetry = vi.fn();
    const module = { ok: true };
    let calls = 0;
    await resilientLoad<typeof module>("t/Hang2", {
      load: async (_id, ctx) => {
        calls++;
        if (ctx.attempt === 1) await new Promise<void>(() => {});
        return module;
      },
      maxAttempts: 3,
      timeoutMs: 10,
      sleep: instant,
      telemetry: { onRetry },
    });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry.mock.calls[0]![0].timedOut).toBe(true);
  });

  it("exhausts all attempts on persistent timeout and throws RemoteLoadError", async () => {
    await expect(
      resilientLoad("t/AlwaysHang", {
        load: async () => new Promise<null>(() => {}),
        maxAttempts: 2,
        timeoutMs: 10,
        sleep: instant,
      }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
  });

  it("serves the fallback after timeout-induced exhaustion", async () => {
    const fb = { fromFallback: true };
    const mod = await resilientLoad<typeof fb>("t/HangFb", {
      load: async () => new Promise<null>(() => {}),
      maxAttempts: 2,
      timeoutMs: 10,
      sleep: instant,
      fallback: () => fb,
    });
    expect(mod).toBe(fb);
  });

  it("does not apply a timeout when timeoutMs is 0", async () => {
    // Load that waits 5ms — fine without a timeout, would fail with timeoutMs=1.
    const module = { ok: true };
    let done = false;
    const mod = await resilientLoad<typeof module>("t/NoTimeout", {
      load: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            done = true;
            resolve(module);
          }, 5);
        }),
      timeoutMs: 0,
      sleep: instant,
    });
    expect(mod).toBe(module);
    expect(done).toBe(true);
  });
});

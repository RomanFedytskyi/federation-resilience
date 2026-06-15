import { describe, expect, it, vi } from "vitest";
import { schedulePrefetch } from "../src/core/prefetch.js";

// Immediate idle shim: invokes the callback synchronously.
const immediateIdle = (cb: (d: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
  cb({ didTimeout: true, timeRemaining: () => 0 });
  return 1;
};

describe("schedulePrefetch", () => {
  it("warms a function fallback during idle and reports success", async () => {
    const warm = vi.fn();
    let called = false;
    const h = schedulePrefetch(async () => null, {
      fallback: () => {
        called = true;
        return { ok: true };
      },
      requestIdle: immediateIdle,
      onWarm: warm,
    });
    await h.done;
    expect(called).toBe(true);
    expect(warm).toHaveBeenCalledWith({ ok: true });
  });

  it("warms a remote-id fallback via the injected LoadFn", async () => {
    let loaded: string | undefined;
    const h = schedulePrefetch(
      async (id) => {
        loaded = id;
        return { m: 1 };
      },
      { fallback: "stable/Mod", requestIdle: immediateIdle },
    );
    await h.done;
    expect(loaded).toBe("stable/Mod");
  });

  it("isolates a failing warm: done resolves, error reported, never throws", async () => {
    const warm = vi.fn();
    const h = schedulePrefetch(async () => null, {
      fallback: () => {
        throw new Error("warm failed");
      },
      requestIdle: immediateIdle,
      onWarm: warm,
    });
    await expect(h.done).resolves.toBeUndefined();
    expect(warm).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("cancel() before idle prevents the warm from running", async () => {
    let ran = false;
    // Idle that defers via setTimeout so we can cancel first.
    const deferredIdle = (cb: (d?: any) => void) => setTimeout(() => cb(), 100) as unknown as number;
    const h = schedulePrefetch(async () => null, {
      fallback: () => {
        ran = true;
        return {};
      },
      requestIdle: deferredIdle,
    });
    h.cancel();
    h.cancel(); // idempotent
    await h.done;
    expect(ran).toBe(false);
  });

  it("falls back to a setTimeout shim when no requestIdleCallback exists", async () => {
    const hadRIC = "requestIdleCallback" in globalThis;
    let warmed = false;
    const h = schedulePrefetch(async () => null, {
      fallback: () => {
        warmed = true;
        return {};
      },
      timeoutMs: 1,
    });
    await h.done;
    expect(warmed).toBe(true);
    // sanity: we didn't accidentally define the global
    expect("requestIdleCallback" in globalThis).toBe(hadRIC);
  });
});

describe("schedulePrefetch cancel paths", () => {
  it("uses globalThis.cancelIdleCallback when present", async () => {
    const cancelSpy = vi.fn();
    (globalThis as any).cancelIdleCallback = cancelSpy;
    try {
      const deferredIdle = (cb: (d?: any) => void) => setTimeout(() => cb(), 100) as unknown as number;
      const h = schedulePrefetch(async () => null, {
        fallback: () => ({}),
        requestIdle: deferredIdle,
      });
      h.cancel();
      await h.done;
      expect(cancelSpy).toHaveBeenCalled();
    } finally {
      delete (globalThis as any).cancelIdleCallback;
    }
  });

  it("settles cleanly when canceled exactly as idle fires", async () => {
    let fire: (() => void) | undefined;
    const captureIdle = (cb: (d?: any) => void) => {
      fire = cb;
      return 7;
    };
    let ran = false;
    const h = schedulePrefetch(async () => null, {
      fallback: () => {
        ran = true;
        return {};
      },
      requestIdle: captureIdle,
    });
    h.cancel(); // cancel before the captured idle callback runs
    fire?.(); // now fire idle: must early-return and settle, not warm
    await h.done;
    expect(ran).toBe(false);
  });

  it("onWarm throwing does not break settlement", async () => {
    const immediateIdle = (cb: (d: any) => void) => {
      cb({ didTimeout: true, timeRemaining: () => 0 });
      return 1;
    };
    const h = schedulePrefetch(async () => null, {
      fallback: () => ({}),
      requestIdle: immediateIdle,
      onWarm: () => {
        throw new Error("onWarm blew up");
      },
    });
    await expect(h.done).resolves.toBeUndefined();
  });
});

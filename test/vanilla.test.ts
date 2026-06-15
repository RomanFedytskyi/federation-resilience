import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the real Module Federation runtime so the adapter can be exercised with
// zero network. We capture registered plugins to drive the cache-bust hook.
const mfLoadRemote = vi.fn();
const registeredPlugins: any[] = [];
const registerPlugins = vi.fn((plugins: any[]) => {
  registeredPlugins.push(...plugins);
});

vi.mock("@module-federation/enhanced/runtime", () => ({
  loadRemote: (...args: any[]) => (mfLoadRemote as any)(...args),
  registerPlugins: (...args: any[]) => (registerPlugins as any)(...args),
}));

import { loadResilientRemote, prefetchFallback } from "../src/adapters/vanilla.js";
import { RemoteLoadError } from "../src/types.js";

const instant = () => Promise.resolve();

beforeEach(() => {
  mfLoadRemote.mockReset();
  registerPlugins.mockClear();
  // NB: do not clear registeredPlugins — the adapter registers the cache-bust
  // plugin once via a module-level singleton; we keep the captured reference.
});

describe("loadResilientRemote (default MF loader)", () => {
  it("resolves a first-attempt success via MF loadRemote", async () => {
    const mod = { default: () => null };
    mfLoadRemote.mockResolvedValueOnce(mod);
    const out = await loadResilientRemote("checkout/Cart", { sleep: instant });
    expect(out).toBe(mod);
    expect(mfLoadRemote).toHaveBeenCalledWith("checkout/Cart");
  });

  it("retries then succeeds, registering the cache-bust plugin", async () => {
    const mod = { ok: true };
    mfLoadRemote
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce(mod);
    const out = await loadResilientRemote("checkout/Cart", {
      maxAttempts: 3,
      sleep: instant,
    });
    expect(out).toBe(mod);
    expect(registerPlugins).toHaveBeenCalled();
    // The registered plugin rewrites the resolved entry URL with the bust token.
    const plugin = registeredPlugins.find(
      (p) => p.name === "federation-resilience-cache-bust",
    );
    expect(plugin).toBeTruthy();
  });

  it("cache-bust plugin appends the token to the resolved entry URL", async () => {
    // Trigger a retry so a token is registered for the remote.
    let resolveEntry = "";
    mfLoadRemote.mockImplementation(async (id: string) => {
      // Simulate MF resolving the entry and invoking afterResolve mid-load.
      const plugin = registeredPlugins.find(
        (p) => p.name === "federation-resilience-cache-bust",
      );
      if (plugin) {
        const args = {
          id,
          remoteInfo: { entry: "https://cdn.test/checkout/remoteEntry.js" },
        };
        plugin.afterResolve(args);
        resolveEntry = args.remoteInfo.entry;
      }
      if (mfLoadRemote.mock.calls.length < 2) throw new Error("500");
      return { ok: true };
    });
    await loadResilientRemote("checkout/Cart", { maxAttempts: 3, sleep: instant });
    expect(resolveEntry).toContain("__mf_bust=");
  });

  it("falls back to a pinned module when MF keeps failing", async () => {
    mfLoadRemote.mockRejectedValue(new Error("down"));
    const fb = { fallback: true };
    const out = await loadResilientRemote("checkout/Cart", {
      maxAttempts: 2,
      sleep: instant,
      fallback: () => fb,
    });
    expect(out).toBe(fb);
  });

  it("throws RemoteLoadError when MF fails and no fallback is pinned", async () => {
    mfLoadRemote.mockRejectedValue(new Error("down"));
    await expect(
      loadResilientRemote("checkout/Cart", { maxAttempts: 2, sleep: instant }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
  });

  it("treats MF's null resolution as failure", async () => {
    mfLoadRemote.mockResolvedValue(null);
    await expect(
      loadResilientRemote("checkout/Cart", { maxAttempts: 2, sleep: instant }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
  });
});

describe("prefetchFallback (default MF loader)", () => {
  const immediateIdle = (cb: (d: any) => void) => {
    cb({ didTimeout: true, timeRemaining: () => 0 });
    return 1;
  };

  it("warms a remote-id fallback through MF during idle", async () => {
    mfLoadRemote.mockResolvedValue({ warm: true });
    const h = prefetchFallback("checkout/Cart", {
      fallback: "checkout-stable/Cart",
      requestIdle: immediateIdle,
    });
    await h.done;
    expect(mfLoadRemote).toHaveBeenCalledWith("checkout-stable/Cart");
  });

  it("warms a function fallback without touching MF", async () => {
    let warmed = false;
    const h = prefetchFallback("checkout/Cart", {
      fallback: () => {
        warmed = true;
        return {};
      },
      requestIdle: immediateIdle,
    });
    await h.done;
    expect(warmed).toBe(true);
    expect(mfLoadRemote).not.toHaveBeenCalled();
  });
});

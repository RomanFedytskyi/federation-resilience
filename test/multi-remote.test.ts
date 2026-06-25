import { describe, expect, it } from "vitest";
import { resilientLoad } from "../src/core/resilient-loader.js";
import { RemoteLoadError } from "../src/types.js";
import type { LoadFn } from "../src/types.js";

const instant = () => Promise.resolve();

/**
 * loadResilientRemotes lives in the vanilla adapter (needs @module-federation/enhanced).
 * We test the equivalent parallel-with-isolation pattern directly on resilientLoad
 * to cover the logic without the MF import, plus verify the MultiRemoteResult
 * contract by building the same Promise.all pattern the adapter uses.
 */
async function parallelLoad<T>(
  entries: Array<{ remoteId: string; load: LoadFn<T> }>,
): Promise<Array<{ remoteId: string; status: "success"; module: T } | { remoteId: string; status: "error"; error: RemoteLoadError }>> {
  return Promise.all(
    entries.map(({ remoteId, load }) =>
      resilientLoad<T>(remoteId, { load, maxAttempts: 2, sleep: instant })
        .then((module) => ({ remoteId, status: "success" as const, module }))
        .catch((error: unknown) => ({
          remoteId,
          status: "error" as const,
          error: error instanceof RemoteLoadError
            ? error
            : new RemoteLoadError({ remoteId, attempts: 1, cause: error }),
        })),
    ),
  );
}

describe("loadResilientRemotes (parallel + isolated)", () => {
  it("loads multiple remotes concurrently — all succeed", async () => {
    const cartMod = { id: "cart" };
    const navMod = { id: "nav" };
    const results = await parallelLoad([
      { remoteId: "checkout/Cart", load: async () => cartMod },
      { remoteId: "nav/Menu",      load: async () => navMod },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ remoteId: "checkout/Cart", status: "success", module: cartMod });
    expect(results[1]).toMatchObject({ remoteId: "nav/Menu",      status: "success", module: navMod });
  });

  it("one failure does not affect other remotes", async () => {
    const navMod = { id: "nav" };
    const results = await parallelLoad([
      { remoteId: "checkout/Cart", load: async () => { throw new Error("cart down"); } },
      { remoteId: "nav/Menu",      load: async () => navMod },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ remoteId: "checkout/Cart", status: "error" });
    expect((results[0] as { status: "error"; error: RemoteLoadError }).error).toBeInstanceOf(RemoteLoadError);
    expect(results[1]).toMatchObject({ remoteId: "nav/Menu", status: "success", module: navMod });
  });

  it("all failing returns all error results", async () => {
    const results = await parallelLoad([
      { remoteId: "a/Mod", load: async () => { throw new Error("down"); } },
      { remoteId: "b/Mod", load: async () => { throw new Error("down"); } },
    ]);
    for (const r of results) {
      expect(r.status).toBe("error");
      expect((r as { status: "error"; error: RemoteLoadError }).error).toBeInstanceOf(RemoteLoadError);
    }
  });

  it("runs loads in parallel (overlapping in-flight)", async () => {
    const order: string[] = [];
    // Both start immediately; the "settled" order should reflect parallel start.
    await parallelLoad([
      {
        remoteId: "p/A",
        load: async () => {
          order.push("A-start");
          await new Promise<void>((r) => setTimeout(r, 10));
          order.push("A-end");
          return { id: "a" };
        },
      },
      {
        remoteId: "p/B",
        load: async () => {
          order.push("B-start");
          await new Promise<void>((r) => setTimeout(r, 5));
          order.push("B-end");
          return { id: "b" };
        },
      },
    ]);
    // Both started before either ended — they ran concurrently.
    expect(order.indexOf("A-start")).toBeLessThan(order.indexOf("A-end"));
    expect(order.indexOf("B-start")).toBeLessThan(order.indexOf("B-end"));
    // Both should have started before A ends (parallel, not serial).
    expect(order.indexOf("B-start")).toBeLessThan(order.indexOf("A-end"));
  });

  it("each remote gets its own independent retry chain", async () => {
    const callsA: number[] = [];
    const callsB: number[] = [];
    const modA = { id: "a" };
    const modB = { id: "b" };
    const results = await parallelLoad([
      {
        remoteId: "retry/A",
        load: async (_id: string, ctx: { attempt: number; isFallback: boolean }) => {
          callsA.push(ctx.attempt);
          if (ctx.attempt < 2) throw new Error("transient");
          return modA;
        },
      },
      {
        remoteId: "retry/B",
        load: async () => modB,
      },
    ]);
    expect(results[0]).toMatchObject({ status: "success", module: modA });
    expect(results[1]).toMatchObject({ status: "success", module: modB });
    // Remote A retried; remote B succeeded on first attempt.
    expect(callsA).toEqual([1, 2]);
  });

  it("handles an empty entries array", async () => {
    const results = await parallelLoad([]);
    expect(results).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { fallbackKind, resolveFallback } from "../src/core/fallback.js";

describe("fallback", () => {
  it("classifies kind", () => {
    expect(fallbackKind("remote/Mod")).toBe("remote");
    expect(fallbackKind(() => ({}))).toBe("module");
  });

  it("invokes a function fallback (sync and async)", async () => {
    const sync = await resolveFallback(() => ({ v: 1 }), async () => null);
    expect(sync).toEqual({ v: 1 });
    const asyncFb = await resolveFallback(async () => ({ v: 2 }), async () => null);
    expect(asyncFb).toEqual({ v: 2 });
  });

  it("loads a remote-id fallback via LoadFn with isFallback=true", async () => {
    let seen: boolean | undefined;
    const mod = await resolveFallback("stable/Mod", async (_id, ctx) => {
      seen = ctx.isFallback;
      return { ok: true };
    });
    expect(mod).toEqual({ ok: true });
    expect(seen).toBe(true);
  });

  it("throws when a remote-id fallback resolves to null", async () => {
    await expect(
      resolveFallback("stable/Mod", async () => null),
    ).rejects.toThrow(/resolved to null/);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyCacheBust,
  mintCacheBust,
  DEFAULT_CACHE_BUST_PARAM,
} from "../src/core/cache-bust.js";

describe("cache-bust", () => {
  it("appends the param to an absolute URL", () => {
    const out = applyCacheBust("https://cdn.test/remoteEntry.js", "abc");
    expect(out).toContain(`${DEFAULT_CACHE_BUST_PARAM}=abc`);
    expect(out.startsWith("https://cdn.test/remoteEntry.js?")).toBe(true);
  });

  it("preserves existing query and hash", () => {
    const out = applyCacheBust("https://cdn.test/e.js?v=1#frag", "tok");
    expect(out).toContain("v=1");
    expect(out).toContain("__mf_bust=tok");
    expect(out).toContain("#frag");
  });

  it("is idempotent for the same token (no duplicate params)", () => {
    const once = applyCacheBust("https://cdn.test/e.js", "same");
    const twice = applyCacheBust(once, "same");
    expect(twice).toBe(once);
    const count = (twice.match(/__mf_bust=/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("replaces an old token with a new one", () => {
    const a = applyCacheBust("https://cdn.test/e.js", "old");
    const b = applyCacheBust(a, "new");
    expect(b).toContain("__mf_bust=new");
    expect(b).not.toContain("old");
    expect((b.match(/__mf_bust=/g) ?? []).length).toBe(1);
  });

  it("handles relative URLs", () => {
    const out = applyCacheBust("/assets/remoteEntry.js", "r1");
    expect(out.startsWith("/assets/remoteEntry.js?")).toBe(true);
    expect(out).toContain("__mf_bust=r1");
  });

  it("supports a custom param name", () => {
    const out = applyCacheBust("https://cdn.test/e.js", "z", "_cb");
    expect(out).toContain("_cb=z");
  });

  it("mintCacheBust produces unique tokens", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => mintCacheBust()));
    expect(tokens.size).toBe(500);
  });
});

describe("cache-bust manual fallback (URL parse failure)", () => {
  it("appends via string surgery when URL() throws", () => {
    const out = applyCacheBust("http://[bad-host", "tok");
    expect(out).toContain("__mf_bust=tok");
  });

  it("replaces an existing param via string surgery", () => {
    const a = applyCacheBust("http://[bad-host?__mf_bust=old", "new");
    expect(a).toContain("__mf_bust=new");
    expect(a).not.toContain("old");
  });

  it("preserves a hash in the manual path", () => {
    const out = applyCacheBust("http://[bad-host/p#frag", "t");
    expect(out).toContain("#frag");
    expect(out).toContain("__mf_bust=t");
  });
});

import { describe, expect, it } from "vitest";
import { RemoteLoadError } from "../src/types.js";
import { checkAllProperties } from "../src/properties/properties.js";

describe("RemoteLoadError", () => {
  it("is an Error with structured fields", () => {
    const cause = new Error("root");
    const e = new RemoteLoadError({ remoteId: "x/Y", attempts: 3, cause });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(RemoteLoadError);
    expect(e.name).toBe("RemoteLoadError");
    expect(e.remoteId).toBe("x/Y");
    expect(e.attempts).toBe(3);
    expect(e.cause).toBe(cause);
    expect(e.fallbackFailed).toBe(false);
    expect(e.message).toContain("x/Y");
  });

  it("notes when the fallback also failed", () => {
    const e = new RemoteLoadError({
      remoteId: "x/Y",
      attempts: 2,
      cause: new Error("fb"),
      fallbackFailed: true,
    });
    expect(e.fallbackFailed).toBe(true);
    expect(e.message).toContain("fallback also failed");
  });
});

describe("checkAllProperties", () => {
  it("all five properties pass with representative inputs", async () => {
    const results = await checkAllProperties();
    for (const [name, r] of Object.entries(results)) {
      expect(r.passed, `${name}: ${r.detail}`).toBe(true);
    }
  });
});

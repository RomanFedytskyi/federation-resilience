import { describe, expect, it, vi } from "vitest";
import { safeTelemetry } from "../src/telemetry/hooks.js";

describe("safeTelemetry", () => {
  it("fills missing hooks with no-ops", () => {
    const t = safeTelemetry();
    expect(() =>
      t.onAttempt({ remoteId: "x", attempt: 1, maxAttempts: 1 }),
    ).not.toThrow();
  });

  it("forwards events to provided hooks", () => {
    const onSuccess = vi.fn();
    const t = safeTelemetry({ onSuccess });
    t.onSuccess({ remoteId: "x", attempt: 1, viaFallback: false });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("swallows a throwing hook so loading is never affected", () => {
    const t = safeTelemetry({
      onRetry: () => {
        throw new Error("boom");
      },
    });
    expect(() =>
      t.onRetry({
        remoteId: "x",
        attempt: 1,
        nextAttempt: 2,
        delayMs: 0,
        error: new Error("e"),
        timedOut: false,
      }),
    ).not.toThrow();
  });
});

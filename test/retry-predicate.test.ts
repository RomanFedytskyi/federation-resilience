import { describe, expect, it, vi } from "vitest";
import { resilientLoad } from "../src/core/resilient-loader.js";
import { RemoteLoadError } from "../src/types.js";

const instant = () => Promise.resolve();

class NotFoundError extends Error {
  readonly status = 404;
}

describe("retryIf", () => {
  it("skips all retries when predicate returns false on attempt 1", async () => {
    let calls = 0;
    const onRetry = vi.fn();
    await expect(
      resilientLoad("rp/Skip", {
        load: async () => {
          calls++;
          throw new NotFoundError("not found");
        },
        maxAttempts: 5,
        sleep: instant,
        retryIf: () => false,
        telemetry: { onRetry },
      }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
    // Only one attempt should have been made — no retries.
    expect(calls).toBe(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("skips to fallback when predicate returns false (fallback present)", async () => {
    const fb = { fallback: true };
    let calls = 0;
    const mod = await resilientLoad<typeof fb>("rp/SkipFb", {
      load: async () => {
        calls++;
        throw new NotFoundError("not found");
      },
      maxAttempts: 5,
      sleep: instant,
      retryIf: () => false,
      fallback: () => fb,
    });
    expect(mod).toBe(fb);
    expect(calls).toBe(1);
  });

  it("retries on some errors and skips on others using error type", async () => {
    let calls = 0;
    const module = { ok: true };
    // Fail transiently (generic Error) twice, then succeed.
    // retryIf: only retry non-NotFoundErrors.
    const mod = await resilientLoad<typeof module>("rp/Selective", {
      load: async (_id, ctx) => {
        calls++;
        if (ctx.attempt <= 2) throw new Error("transient");
        return module;
      },
      maxAttempts: 5,
      sleep: instant,
      retryIf: (error) => !(error instanceof NotFoundError),
    });
    expect(mod).toBe(module);
    expect(calls).toBe(3);
  });

  it("stops retrying on attempt 2 when predicate returns false on attempt 2", async () => {
    let calls = 0;
    const retryIf = vi.fn((_err: unknown, attempt: number) => attempt < 2);
    await expect(
      resilientLoad("rp/Stop2", {
        load: async () => {
          calls++;
          throw new Error("fail");
        },
        maxAttempts: 10,
        sleep: instant,
        retryIf,
      }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
    // Attempt 1 fails → retryIf(err, 1) = true → attempt 2 fires
    // Attempt 2 fails → retryIf(err, 2) = false → stop
    expect(calls).toBe(2);
  });

  it("receives the actual error and attempt number in the predicate", async () => {
    const capturedArgs: Array<[unknown, number]> = [];
    await expect(
      resilientLoad("rp/Args", {
        load: async (_id, ctx) => {
          throw new Error(`err-${ctx.attempt}`);
        },
        maxAttempts: 3,
        sleep: instant,
        retryIf: (err, attempt) => {
          capturedArgs.push([err, attempt]);
          return true; // always retry
        },
      }),
    ).rejects.toBeInstanceOf(RemoteLoadError);
    // retryIf is called after attempts 1 and 2 (not after the last attempt).
    expect(capturedArgs).toHaveLength(2);
    expect((capturedArgs[0]![0] as Error).message).toBe("err-1");
    expect(capturedArgs[0]![1]).toBe(1);
    expect((capturedArgs[1]![0] as Error).message).toBe("err-2");
    expect(capturedArgs[1]![1]).toBe(2);
  });
});

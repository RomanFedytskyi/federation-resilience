/**
 * Deterministic fallback resolution.
 *
 * WHY: when every retry of the primary remote fails, the shell must still render
 * *something*. The caller pins a fallback — either another remote id/version or
 * a local module — and we load it deterministically. This library never *picks*
 * a fallback for you (no version-resolution policy); it loads exactly what you
 * pinned.
 */
import type { Fallback, LoadFn } from "../types.js";

/** Discriminate a fallback without executing it. */
export function fallbackKind(fb: Fallback): "remote" | "module" {
  return typeof fb === "function" ? "module" : "remote";
}

/**
 * Load a pinned fallback. A string is loaded through the same LoadFn (so it gets
 * the same resilient transport), marked `isFallback`. A function is invoked
 * directly (local module). Throws if the fallback itself fails — the caller
 * (resilient loader) converts that into a typed RemoteLoadError.
 */
export async function resolveFallback<T>(
  fb: Fallback<T>,
  load: LoadFn<T>,
): Promise<T> {
  if (typeof fb === "function") {
    return await (fb as () => T | Promise<T>)();
  }
  const mod = await load(fb, { attempt: 1, isFallback: true });
  if (mod == null) {
    throw new Error(`Fallback remote "${fb}" resolved to null`);
  }
  return mod;
}

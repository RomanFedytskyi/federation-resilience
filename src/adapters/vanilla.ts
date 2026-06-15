/**
 * Vanilla (framework-agnostic) adapter.
 *
 * Exposes the two public entry points used by every host (React, Vue, Angular,
 * Svelte, bare ESM):
 *   - loadResilientRemote(remoteId, options)  → resilient primary load
 *   - prefetchFallback(remoteId, options)      → idle warm of the fallback
 *
 * It supplies the default Module Federation 2.0-backed loader (confirmed against
 * @module-federation/enhanced@2.5.1: `loadRemote<T>(id) => Promise<T | null>`),
 * and wires cache-busting into MF's resolved remote-entry URL via a runtime
 * plugin's `afterResolve` hook so retried imports defeat Chromium's sticky
 * failed-import cache.
 */
import {
  loadRemote as mfLoadRemote,
  registerPlugins,
} from "@module-federation/enhanced/runtime";
import type {
  LoadContext,
  LoadFn,
  PrefetchHandle,
  PrefetchOptions,
  ResilientLoadOptions,
  RemoteId,
} from "../types.js";
import { resilientLoad } from "../core/resilient-loader.js";
import { schedulePrefetch } from "../core/prefetch.js";
import {
  applyCacheBust,
  DEFAULT_CACHE_BUST_PARAM,
} from "../core/cache-bust.js";

/**
 * Per-remote "pending cache-bust" registry. The loader sets the token for a
 * remoteId immediately before calling MF's global `loadRemote(id)`, and the
 * runtime plugin reads it back in `afterResolve` to rewrite that remote's entry
 * URL. Keyed by remoteId so concurrent loads of *different* remotes don't clash.
 */
const pendingBust = new Map<string, { token: string; param: string }>();

let pluginRegistered = false;

/** Register (once) the MF runtime plugin that applies cache-bust to entry URLs. */
function ensureCacheBustPlugin(): void {
  if (pluginRegistered) return;
  pluginRegistered = true;
  try {
    registerPlugins([
      {
        name: "federation-resilience-cache-bust",
        // afterResolve is an AsyncWaterfallHook<LoadRemoteMatch>; we mutate the
        // resolved entry URL so the *retry* fetches a different module-map key.
        afterResolve(args: any) {
          try {
            const id = args?.id;
            const entry = args?.remoteInfo?.entry;
            if (id && entry) {
              const hit = pendingBust.get(id) ?? matchByPrefix(id);
              if (hit && args.remoteInfo) {
                args.remoteInfo.entry = applyCacheBust(entry, hit.token, hit.param);
              }
            }
          } catch {
            /* best-effort: never break resolution */
          }
          return args;
        },
      },
    ] as Parameters<typeof registerPlugins>[0]);
  } catch {
    // If the host's MF version rejects plugin registration, cache-busting falls
    // back to a no-op; retries still happen, just without URL rewriting. The
    // token is still produced and surfaced via LoadContext for custom loaders.
    pluginRegistered = false;
  }
}

/** MF resolves "checkout/Cart" against a remote keyed "checkout"; match by prefix. */
function matchByPrefix(id: string): { token: string; param: string } | undefined {
  const key = id.split("/")[0];
  return key ? pendingBust.get(key) : undefined;
}

/** Build the default MF-backed LoadFn for a given cache-bust param name. */
function defaultMfLoad<T>(param: string): LoadFn<T> {
  return async (remoteId: RemoteId, ctx: LoadContext) => {
    if (ctx.cacheBust) {
      ensureCacheBustPlugin();
      pendingBust.set(remoteId, { token: ctx.cacheBust, param });
      pendingBust.set(remoteId.split("/")[0] ?? remoteId, {
        token: ctx.cacheBust,
        param,
      });
    }
    try {
      // MF2 loadRemote can resolve to T | null; the core treats null as failure.
      return (await mfLoadRemote<T>(remoteId)) as T | null;
    } finally {
      if (ctx.cacheBust) {
        pendingBust.delete(remoteId);
        pendingBust.delete(remoteId.split("/")[0] ?? remoteId);
      }
    }
  };
}

/**
 * Load a federated remote resiliently. Retries with cache-busted exponential
 * backoff, falls back to a pinned remote/module, and on total failure throws a
 * single typed RemoteLoadError instead of crashing the host shell.
 *
 * Prevents: a single down/slow/500 remote taking down the whole shell, and the
 * "retry forever hits the cached failure" trap from Chromium's sticky import cache.
 *
 * @example
 * const mod = await loadResilientRemote<{ mount: Function }>("checkout/Cart", {
 *   maxAttempts: 4,
 *   fallback: "checkout-stable/Cart",
 *   telemetry: { onGiveUp: (e) => report(e) },
 * });
 */
export function loadResilientRemote<T = unknown>(
  remoteId: RemoteId,
  options: ResilientLoadOptions<T> = {},
): Promise<T> {
  const param = options.cacheBustParam ?? DEFAULT_CACHE_BUST_PARAM;
  const load = options.load ?? defaultMfLoad<T>(param);
  return resilientLoad<T>(remoteId, { ...options, load });
}

/**
 * Warm a remote's pinned fallback during browser idle time so failover is
 * instant. NON-INTERFERING by contract: never blocks, throws, or alters a
 * concurrent `loadResilientRemote`. Returns a cancelable handle.
 *
 * Prevents: the user staring at a spinner during the fallback's first network
 * round-trip after the primary has already failed.
 *
 * @example
 * const warm = prefetchFallback("checkout/Cart", { fallback: "checkout-stable/Cart" });
 * // later, if navigating away: warm.cancel();
 */
export function prefetchFallback<T = unknown>(
  _remoteId: RemoteId,
  options: PrefetchOptions<T>,
): PrefetchHandle {
  const param = DEFAULT_CACHE_BUST_PARAM;
  const load = options.load ?? defaultMfLoad<T>(param);
  return schedulePrefetch<T>(load, options);
}

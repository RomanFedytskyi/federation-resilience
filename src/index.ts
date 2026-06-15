/**
 * federation-resilience — public barrel.
 *
 * "Never let a single failed remote take down your shell."
 *
 * Framework-agnostic core. React ships from the optional subpath
 * "federation-resilience/react" so non-React hosts pay nothing for it.
 */

// Primary API
export { loadResilientRemote, prefetchFallback } from "./adapters/vanilla.js";

// Pure building blocks (documented reference core)
export {
  baseDelay,
  computeDelay,
  applyJitter,
  resolveBackoff,
  DEFAULT_BACKOFF,
} from "./core/backoff.js";
export {
  applyCacheBust,
  mintCacheBust,
  DEFAULT_CACHE_BUST_PARAM,
} from "./core/cache-bust.js";
export { fallbackKind, resolveFallback } from "./core/fallback.js";
export { schedulePrefetch } from "./core/prefetch.js";
export { resilientLoad } from "./core/resilient-loader.js";
export { safeTelemetry } from "./telemetry/hooks.js";

// Checkable correctness properties
export {
  checkBoundedTermination,
  checkFallbackSafety,
  checkBackoffMonotonicity,
  checkCacheBustIdempotence,
  checkPrefetchNonInterference,
  checkAllProperties,
} from "./properties/properties.js";

// The single typed error
export { RemoteLoadError } from "./types.js";

// Canonical types (single source of truth)
export type {
  RemoteId,
  LoadFn,
  LoadContext,
  CacheBustToken,
  Fallback,
  JitterStrategy,
  BackoffOptions,
  TelemetryHooks,
  AttemptEvent,
  RetryEvent,
  FallbackEvent,
  SuccessEvent,
  GiveUpEvent,
  ResilientSeams,
  ResilientLoadOptions,
  PrefetchOptions,
  PrefetchHandle,
  RequestIdleCallbackLike,
  PropertyResult,
} from "./types.js";

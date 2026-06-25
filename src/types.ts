/**
 * Canonical type module — the SINGLE source of truth for federation-resilience.
 *
 * Every other module imports its types from here and never redeclares them.
 * This mirrors the "one canonical types module" discipline: if a shape needs to
 * change, it changes in exactly one place.
 */

/** A Module Federation remote identifier, e.g. "checkout/Cart". */
export type RemoteId = string;

/**
 * The minimal surface we need from Module Federation 2.0's `loadRemote`.
 *
 * Confirmed against @module-federation/enhanced@2.5.1:
 *   loadRemote<T>(id, options?) => Promise<T | null>
 *
 * WHY a function seam instead of importing loadRemote directly: it keeps the
 * core framework- and bundler-agnostic and makes every behaviour deterministically
 * testable with zero network. The vanilla adapter supplies the real MF-backed
 * implementation; tests supply a scripted mock.
 *
 * `ctx.cacheBust` is the per-attempt cache-busting token (see CacheBustToken).
 * It is `undefined` on the very first attempt and a fresh unique value on every
 * retry, so an implementation can append it to the remote-entry URL to defeat
 * Chromium's sticky failed-dynamic-import cache.
 */
export type LoadFn<T = unknown> = (
  remoteId: RemoteId,
  ctx: LoadContext,
) => Promise<T | null>;

/** Context handed to a LoadFn on each invocation. */
export interface LoadContext {
  /** 1-based attempt number for the primary load (always 1 for fallback loads). */
  readonly attempt: number;
  /** Fresh cache-busting token; `undefined` on the first attempt, set on retries. */
  readonly cacheBust?: CacheBustToken;
  /** True when this load is the fallback path rather than the primary remote. */
  readonly isFallback: boolean;
}

/** An opaque, collision-resistant cache-busting token. */
export type CacheBustToken = string;

/**
 * A caller-pinned fallback. Either:
 *  - a different remote id / version (string), loaded via the same LoadFn, or
 *  - a local module factory (sync or async) returning the module directly.
 *
 * Deliberately tiny: this library does NOT decide *which* version a user is
 * allowed to see — the caller pins the fallback explicitly.
 */
export type Fallback<T = unknown> =
  | RemoteId
  | (() => T | Promise<T>);

/** Jitter strategy applied on top of the deterministic backoff schedule. */
export type JitterStrategy = "none" | "full" | "equal";

/** Exponential-backoff configuration. */
export interface BackoffOptions {
  /** Base delay in ms for the first retry. Default 100. */
  readonly baseMs: number;
  /** Upper bound in ms; delays are clamped to this. Default 5000. */
  readonly capMs: number;
  /** Growth factor per retry. Default 2. */
  readonly factor: number;
  /** Jitter applied within the cap. Default "full". */
  readonly jitter: JitterStrategy;
}

/** Structured payloads handed to telemetry hooks (the ONLY observability surface). */
export interface AttemptEvent {
  readonly remoteId: RemoteId;
  /** 1-based attempt number about to run. */
  readonly attempt: number;
  readonly maxAttempts: number;
}
export interface RetryEvent {
  readonly remoteId: RemoteId;
  /** The attempt that just failed. */
  readonly attempt: number;
  /** The attempt that will run after the delay. */
  readonly nextAttempt: number;
  /** Backoff delay (ms) before nextAttempt. */
  readonly delayMs: number;
  readonly error: unknown;
  /** True when the attempt was abandoned due to a per-attempt timeout. */
  readonly timedOut: boolean;
}
export interface FallbackEvent {
  readonly remoteId: RemoteId;
  readonly attemptsMade: number;
  readonly error: unknown;
  /** "remote" if the fallback is another remote id, "module" if a local factory. */
  readonly fallbackKind: "remote" | "module";
}
export interface SuccessEvent {
  readonly remoteId: RemoteId;
  readonly attempt: number;
  /** True when the resolved module came from the fallback, not the primary remote. */
  readonly viaFallback: boolean;
}
export interface GiveUpEvent {
  readonly remoteId: RemoteId;
  readonly attemptsMade: number;
  /** Always a RemoteLoadError. */
  readonly error: RemoteLoadError;
}

/**
 * Telemetry hooks. Generic load-lifecycle events ONLY — never version or
 * compliance lineage. Each hook is optional and may be sync or async; the core
 * invokes them defensively so a throwing hook can never break a load.
 */
export interface TelemetryHooks {
  onAttempt?: (e: AttemptEvent) => void;
  onRetry?: (e: RetryEvent) => void;
  onFallback?: (e: FallbackEvent) => void;
  onSuccess?: (e: SuccessEvent) => void;
  onGiveUp?: (e: GiveUpEvent) => void;
}

/** Injectable seams — all defaulted; tests/adapters override for determinism. */
export interface ResilientSeams<T = unknown> {
  /** The actual remote loader. Required by the core; defaulted by the vanilla adapter. */
  load: LoadFn<T>;
  /** Sleep used between retries. Default setTimeout-based. */
  sleep?: (ms: number) => Promise<void>;
  /** RNG in [0,1) used for jitter. Default Math.random. */
  random?: () => number;
  /** Mints a fresh cache-bust token. Default a monotonic counter + random. */
  mintCacheBust?: () => CacheBustToken;
}

/** Options for a single resilient load. */
export interface ResilientLoadOptions<T = unknown> extends Partial<ResilientSeams<T>> {
  /** Hard upper bound on attempts (inclusive of the first). Default 3. Must be >= 1. */
  maxAttempts?: number;
  /** Backoff configuration (partial; merged with defaults). */
  backoff?: Partial<BackoffOptions>;
  /** Caller-pinned fallback. If omitted, a RemoteLoadError is thrown on exhaustion. */
  fallback?: Fallback<T>;
  /** Telemetry hooks. */
  telemetry?: TelemetryHooks;
  /** Query-param name used by the cache-buster. Default "__mf_bust". */
  cacheBustParam?: string;
  /**
   * Per-attempt timeout in ms. If a single load attempt does not settle within
   * this window, it is treated as a failure and the retry loop continues.
   * Absent or 0 means no timeout (default — existing behaviour).
   */
  timeoutMs?: number;
  /**
   * Predicate called after each failed attempt (before sleeping). Return `false`
   * to stop retrying and jump straight to the fallback (or give up). Useful for
   * skipping retries on errors that are definitively non-retryable (e.g. 404).
   * Defaults to always-true (retry on every error).
   */
  retryIf?: (error: unknown, attempt: number) => boolean;
}

/** Options for idle fallback prefetch. */
export interface PrefetchOptions<T = unknown> extends Partial<ResilientSeams<T>> {
  /** The fallback to warm. Required — prefetch only makes sense for a pinned fallback. */
  fallback: Fallback<T>;
  /** Idle deadline timeout (ms) before forcing the warm. Default 2000. */
  timeoutMs?: number;
  /** Injectable requestIdleCallback (for tests/SSR). Default global or setTimeout shim. */
  requestIdle?: RequestIdleCallbackLike;
  /** Optional notification when the warm settles (never throws to the caller). */
  onWarm?: (result: { ok: boolean; error?: unknown }) => void;
}

/** A cancelable handle returned by prefetch. */
export interface PrefetchHandle {
  /** Cancel the scheduled (or in-flight) warm. Idempotent and side-effect-free. */
  cancel: () => void;
  /** Resolves when the warm settles or is canceled; never rejects. */
  readonly done: Promise<void>;
}

/** Minimal structural type for requestIdleCallback so we don't depend on lib.dom quirks. */
export type RequestIdleCallbackLike = (
  cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  opts?: { timeout?: number },
) => number;

/** Result shape returned by every checkable correctness property. */
export interface PropertyResult {
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * The single typed error this library throws. It NEVER bubbles as an uncaught
 * crash: the loader converts every exhausted/failed path into one of these,
 * carrying the attempt count and the last underlying cause.
 */
export class RemoteLoadError extends Error {
  override readonly name = "RemoteLoadError";
  /** The remote that failed to load. */
  readonly remoteId: RemoteId;
  /** How many primary attempts were made before giving up. */
  readonly attempts: number;
  /** The last underlying error (or the fallback error if the fallback also failed). */
  readonly cause: unknown;
  /** True when a fallback was attempted and also failed. */
  readonly fallbackFailed: boolean;

  constructor(args: {
    remoteId: RemoteId;
    attempts: number;
    cause: unknown;
    fallbackFailed?: boolean;
  }) {
    super(
      `Failed to load remote "${args.remoteId}" after ${args.attempts} attempt(s)` +
        (args.fallbackFailed ? " and the pinned fallback also failed" : ""),
    );
    this.remoteId = args.remoteId;
    this.attempts = args.attempts;
    this.cause = args.cause;
    this.fallbackFailed = args.fallbackFailed ?? false;
    Object.setPrototypeOf(this, RemoteLoadError.prototype);
  }
}

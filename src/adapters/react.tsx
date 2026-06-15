/**
 * Optional React adapter (subpath export "federation-resilience/react").
 *
 * Built entirely on the vanilla core — it adds no resilience logic of its own,
 * only React ergonomics: a hook with an explicit state machine and a render-prop
 * component that surfaces the give-up case as an error state instead of throwing
 * during render (which would still crash the shell — the very thing we prevent).
 *
 * React is a peerDependency; this module is only loaded if you import the subpath.
 */
import {
  lazy as reactLazy,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ResilientLoadOptions, RemoteId, RemoteLoadError } from "../types.js";
import { loadResilientRemote } from "./vanilla.js";

/** Discriminated load state exposed by the hook and component. */
export type ResilientState<T> =
  | { status: "loading"; module: undefined; error: undefined }
  | { status: "success"; module: T; error: undefined }
  | { status: "error"; module: undefined; error: RemoteLoadError };

const LOADING = { status: "loading", module: undefined, error: undefined } as const;

/**
 * Load a federated remote resiliently inside a component. Returns a state machine
 * ({ status, module, error }) that never throws during render — the give-up case
 * is delivered as `status: "error"` so the host can render a boundary instead of
 * unmounting.
 *
 * @example
 * const { status, module, error } = useResilientRemote<CartModule>("checkout/Cart", {
 *   fallback: "checkout-stable/Cart",
 * });
 */
export function useResilientRemote<T = unknown>(
  remote: RemoteId,
  options?: ResilientLoadOptions<T>,
): ResilientState<T> {
  const [state, setState] = useState<ResilientState<T>>(LOADING);
  // Keep latest options without forcing the effect to re-run on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let active = true;
    setState(LOADING);
    loadResilientRemote<T>(remote, optionsRef.current ?? {})
      .then((module) => {
        if (active) setState({ status: "success", module, error: undefined });
      })
      .catch((error: RemoteLoadError) => {
        if (active) setState({ status: "error", module: undefined, error });
      });
    return () => {
      active = false; // ignore late resolutions after unmount / remote change
    };
  }, [remote]);

  return state;
}

/** Props for <ResilientRemote>. Provide exactly one of `render`/`children`. */
export interface ResilientRemoteProps<T = unknown> {
  /** The remote id to load, e.g. "checkout/Cart". */
  remote: RemoteId;
  /** Resilience options (maxAttempts, backoff, fallback, telemetry, …). */
  options?: ResilientLoadOptions<T>;
  /** A caller-pinned fallback (sugar for options.fallback). */
  fallback?: ResilientLoadOptions<T>["fallback"];
  /** Render the loaded module. */
  render?: (module: T) => ReactNode;
  /** Render-prop alternative to `render`. */
  children?: (module: T) => ReactNode;
  /** Shown while loading. */
  loading?: ReactNode;
  /** Shown on the give-up case; receives the typed error. */
  onError?: (error: RemoteLoadError) => ReactNode;
}

/**
 * Declarative resilient remote boundary. Renders `loading` while in flight, the
 * module via `render`/`children` on success, and `onError(error)` on the typed
 * give-up case — so a failed remote degrades gracefully instead of crashing.
 *
 * @example
 * <ResilientRemote
 *   remote="checkout/Cart"
 *   fallback="checkout-stable/Cart"
 *   loading={<Spinner />}
 *   onError={(e) => <CartUnavailable reason={e.message} />}
 *   render={(Cart) => <Cart.default />}
 * />
 */
export function ResilientRemote<T = unknown>(
  props: ResilientRemoteProps<T>,
): ReactElement | null {
  const merged: ResilientLoadOptions<T> = {
    ...(props.options ?? {}),
    ...(props.fallback !== undefined ? { fallback: props.fallback } : {}),
  };
  const state = useResilientRemote<T>(props.remote, merged);
  const renderModule = props.render ?? props.children;

  if (state.status === "loading") {
    return (props.loading ?? null) as ReactElement | null;
  }
  if (state.status === "error") {
    return (props.onError?.(state.error) ?? null) as ReactElement | null;
  }
  return (renderModule ? renderModule(state.module) : null) as ReactElement | null;
}

/**
 * A `React.lazy`-compatible resilient remote, for `<Suspense>` users.
 *
 * WHY: the common modern pattern is `const X = React.lazy(() => loadRemote(...))`,
 * but a raw lazy factory rejects on the FIRST failure and trips the nearest error
 * boundary — exactly the crash we prevent. `lazyRemote` runs the full resilience
 * pipeline (retry + cache-busted backoff + pinned fallback) inside the lazy
 * factory, so the Suspense boundary only sees a rejection after every attempt and
 * the fallback have been exhausted. Pair it with any error boundary for that case.
 *
 * The loaded module must be a valid lazy payload: `{ default: ComponentType }`.
 *
 * @example
 * const Cart = lazyRemote<{ default: React.ComponentType }>("checkout/Cart", {
 *   fallback: "checkout-stable/Cart",
 * });
 * <Suspense fallback={<Spinner/>}><Cart /></Suspense>
 */
export function lazyRemote<T extends { default: ComponentType<any> }>(
  remote: RemoteId,
  options?: ResilientLoadOptions<T>,
): LazyExoticComponent<T["default"]> {
  return reactLazy(() => loadResilientRemote<T>(remote, options ?? {}));
}

// Re-export the core entry points so React users can import everything from the
// subpath if they prefer a single import site.
export { loadResilientRemote, prefetchFallback } from "./vanilla.js";
export type {
  ResilientLoadOptions,
  PrefetchOptions,
  TelemetryHooks,
  RemoteLoadError,
} from "../types.js";

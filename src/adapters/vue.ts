/**
 * Optional Vue 3 adapter (subpath export "federation-resilience/vue").
 *
 * Built entirely on the vanilla core — adds no resilience logic of its own,
 * only Vue Composition API ergonomics: a composable that wraps the load in a
 * reactive `shallowRef` state machine so templates can bind to `status`,
 * `module`, and `error` without ever handling a raw Promise.
 *
 * `vue` is an optional peerDependency; this module is only loaded if you import
 * the subpath, so non-Vue hosts pay nothing for it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useResilientRemote } from "federation-resilience/vue";
 * const { status, module, error } = useResilientRemote("checkout/Cart", {
 *   fallback: "checkout-stable/Cart",
 * });
 * </script>
 * <template>
 *   <Spinner v-if="status === 'loading'" />
 *   <CartUnavailable v-else-if="status === 'error'" :reason="error.message" />
 *   <component v-else :is="module.default" />
 * </template>
 * ```
 */
import {
  shallowRef,
  watchEffect,
  type Ref,
  type ShallowRef,
} from "vue";
import type { ResilientLoadOptions, RemoteId, RemoteLoadError } from "../types.js";
import { loadResilientRemote } from "./vanilla.js";

/** Discriminated load state exposed by the composable. */
export type ResilientState<T> =
  | { status: "loading"; module: undefined; error: undefined }
  | { status: "success"; module: T; error: undefined }
  | { status: "error"; module: undefined; error: RemoteLoadError };

const LOADING: ResilientState<never> = {
  status: "loading",
  module: undefined,
  error: undefined,
};

/**
 * Load a federated remote resiliently inside a Vue component. Returns a
 * readonly `ShallowRef<ResilientState<T>>` that updates reactively.
 *
 * The `remote` argument may be a plain string or a `Ref<string>` — if it is
 * a ref, the load re-fires whenever the ref changes (e.g. route-driven remotes).
 *
 * The state machine never throws during render: the give-up case is delivered as
 * `status: "error"` with a typed `RemoteLoadError`, so the host can show a
 * degraded UI instead of crashing.
 *
 * @example
 * const state = useResilientRemote("checkout/Cart", { fallback: "checkout-stable/Cart" });
 * // state.value.status === "loading" | "success" | "error"
 * // Destructured (loses reactivity unless accessed via .value):
 * const { status, module, error } = toRefs(state.value);
 */
export function useResilientRemote<T = unknown>(
  remote: RemoteId | Ref<RemoteId>,
  options?: ResilientLoadOptions<T>,
): ShallowRef<ResilientState<T>> {
  const state = shallowRef<ResilientState<T>>(LOADING as ResilientState<T>);

  watchEffect((onCleanup) => {
    const remoteId: RemoteId =
      typeof remote === "string" ? remote : remote.value;

    let active = true;
    // Reset to loading whenever the remoteId changes.
    state.value = LOADING as ResilientState<T>;

    loadResilientRemote<T>(remoteId, options ?? {})
      .then((module) => {
        if (active) {
          state.value = { status: "success", module, error: undefined };
        }
      })
      .catch((error: RemoteLoadError) => {
        if (active) {
          state.value = { status: "error", module: undefined, error };
        }
      });

    onCleanup(() => {
      active = false; // ignore late resolutions after component unmount / remote change
    });
  });

  return state;
}

// Re-export core entry points so Vue users can import everything from the
// subpath if they prefer a single import site.
export { loadResilientRemote, loadResilientRemotes, prefetchFallback } from "./vanilla.js";
export type { MultiRemoteEntry, MultiRemoteResult } from "./vanilla.js";
export type {
  ResilientLoadOptions,
  PrefetchOptions,
  TelemetryHooks,
  RemoteLoadError,
} from "../types.js";

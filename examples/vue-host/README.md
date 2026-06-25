# Example: Vue host recovery demo

A runnable Vue 3 host demonstrating `federation-resilience/vue` — the Composition API adapter.

```bash
cd examples/vue-host
npm install
npm run dev      # open the printed localhost URL
```

## What it shows

Three selectable scenarios, each on a fresh composable load:

| Tab | Scenario | Feature demonstrated |
|-----|----------|----------------------|
| **Fail → recover** | Remote fails twice then recovers | `useResilientRemote` basic usage, telemetry timeline |
| **Per-attempt timeout** | Remote hangs indefinitely | `timeoutMs: 800` — `[retry-timeout]` visible in log |
| **retryIf — skip 404** | Remote returns a 404 | `retryIf` skips retries, jumps straight to fallback |

## The composable

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useResilientRemote } from "federation-resilience/vue";

// Plain string
const state = useResilientRemote("checkout/Cart", {
  fallback: "checkout-stable/Cart",
  timeoutMs: 5000,
  retryIf: (err) => !(err instanceof NotFoundError),
});
// state.value.status === "loading" | "success" | "error"

// Reactive Ref — re-fires when the ref changes (route-driven remotes)
const remoteId = ref("checkout/Cart");
const state2 = useResilientRemote(remoteId, { fallback: "checkout-stable/Cart" });
</script>

<template>
  <Spinner  v-if="state.status === 'loading'" />
  <CartView v-else-if="state.status === 'success'" :module="state.module" />
  <CartError v-else :error="state.error" />
</template>
```

> The example uses a scenario-driven fake loader so no second MF app is needed.
> In a real host, omit the `load` option and the default MF `loadRemote` is used automatically.

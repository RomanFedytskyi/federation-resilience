# Example: React host recovery demo

A runnable React host demonstrating the full feature set of `federation-resilience`.
Switch between scenarios and watch the telemetry timeline; the shell never crashes.

```bash
cd examples/react-host
npm install
npm run dev      # open the printed localhost URL
```

## What it shows

### Single remote — scenario demos

Three selectable scenarios, each demonstrating a different resilience feature:

| Tab | Scenario | Feature demonstrated |
|-----|----------|----------------------|
| **Fail → recover** | Remote fails twice (500/timeout) then recovers | Core retry + cache-busted backoff + `onRetry` telemetry |
| **Per-attempt timeout** | Remote hangs indefinitely | `timeoutMs: 800` bounds each attempt; `[retry-timeout]` visible in the telemetry timeline |
| **retryIf — skip 404** | Remote returns a 404 immediately | `retryIf: (err) => !(err instanceof NotFoundError)` skips all retries and jumps straight to the fallback |

### Parallel remotes (`loadResilientRemotes`)

Four remotes fire in parallel. One always fails (served by fallback), one retries twice — neither blocks the others. The total wall-clock time equals the slowest single load, not the sum.

## How it maps to a real host

The demo injects a scenario-driven `load` seam so it runs with no second app to build.
In a real Module Federation host you would call:

```tsx
import { useResilientRemote } from "federation-resilience/react";

const { status, module, error } = useResilientRemote("checkout/Cart", {
  fallback: "checkout-stable/Cart",
  timeoutMs: 5000,
  retryIf: (err) => !(err instanceof NotFoundError),
});
```

```ts
import { loadResilientRemotes } from "federation-resilience";

const results = await loadResilientRemotes([
  { remoteId: "checkout/Cart", options: { fallback: "checkout-stable/Cart" } },
  { remoteId: "nav/Menu",      options: { fallback: "nav-stable/Menu" } },
]);
```

…and the default MF loader handles the real `loadRemote` + cache-busting for you.

> The example data is illustrative (modeled on real storefront failure modes), not
> measured from production. Replace it with your own measured values per
> `../../data/README.md`.

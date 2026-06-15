# Example: React host recovery demo

A minimal, runnable React host that demonstrates the headline guarantee:
**zero host crash and a measured time-to-recover when a remote returns 500 / times out.**

```bash
cd examples/react-host
npm install
npm run dev      # open the printed localhost URL
```

## What it shows

- The **storefront shell** renders normally (`● alive`) the entire time.
- The `checkout/Cart` remote is driven by example data
  (`scenarios/storefront-checkout.example.json`, schema per
  [`../../data/README.md`](../../data/README.md)) that scripts a real
  incident: **fail → timeout → recover**, with a pinned `checkout-stable/Cart`
  fallback.
- The loader retries with **cache-busted exponential backoff**, the **telemetry
  timeline** prints every transition, and the UI shows the **measured
  time-to-recover** while the host-crash count stays **0**.
- Hit **Run again** to replay the incident.

## How it maps to a real host

The demo injects a scenario-driven `load` seam so it runs with no second app to
build. In a real Module Federation host you would simply call:

```tsx
import { useResilientRemote } from "federation-resilience/react";
const { status, module, error } = useResilientRemote("checkout/Cart", {
  fallback: "checkout-stable/Cart",
});
```

…and the default MF loader handles the real `loadRemote` + cache-busting for you.

> The example data is illustrative (modeled on a real storefront), not measured
> from production. Replace it with your own measured values per
> `data/README.md`.

# Comparison with existing approaches

How `federation-resilience` relates to the ad-hoc solutions teams reach for today.
The goal of this table is honesty: it does everything the common helpers do
(retry + cache-bust) **and** the federation-specific things they don't.

| Capability | Native `loadRemote` (MF2) | Hand-rolled `React.lazy` retry | `retry-dynamic-import` (generic chunk retry) | MF `errorLoadRemote` plugin (DIY) | **federation-resilience** |
|---|:--:|:--:|:--:|:--:|:--:|
| Retry on failure | ✗ | ✓ | ✓ | ✓ (you write it) | ✓ |
| Exponential backoff + jitter | ✗ | rarely | ✗ (immediate) | ✗ | ✓ |
| Cache-bust to defeat Chromium sticky failed-import | ✗ | rarely | ✓ | ✗ | ✓ |
| Handles MF2 `null` resolution as failure | ✗ | ✗ | n/a | partial | ✓ |
| Deterministic pinned fallback (remote *or* local) | ✗ | ✗ | ✗ | ✓ (you write it) | ✓ |
| Single typed give-up error (no uncaught crash) | ✗ | ✗ | ✗ | ✗ | ✓ (`RemoteLoadError`) |
| Idle fallback prefetch (instant failover) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Telemetry lifecycle hooks | ✗ | ✗ | ✗ | manual | ✓ (5 events) |
| Framework-agnostic core | n/a | ✗ (React only) | ✓ | ✓ | ✓ |
| React hook + component + `Suspense`/`lazy` | ✗ | partial | ✗ | ✗ | ✓ |
| Formal properties + fixed-seed tests | ✗ | ✗ | ✗ | ✗ | ✓ (5) |
| Bundler-agnostic (webpack/Rspack/Vite/Rollup/Metro) | ✓ (MF2) | n/a | ✓ | ✓ | ✓ |
| Bundled tracing SDK (bloat) | — | — | — | — | none (by design) |

## Notes on each

- **Native `loadRemote`** rejects (or returns `null`) and gives you nothing else.
  One bad remote crashes the shell.
- **Hand-rolled `React.lazy` retry wrappers** are React-only, usually retry
  immediately (no backoff), rarely cache-bust, and have no fallback or telemetry.
- **`retry-dynamic-import`** is a good generic chunk-retry helper with cache-bust,
  but it is **not federation-aware** (no remote-id fallback, no MF `null`
  handling), has **no telemetry**, and **no deterministic fallback**. It patches
  *any* dynamic import; we deliberately scope to *federated remotes* and add the
  federation-specific recovery semantics.
- **`errorLoadRemote` plugin** is the official low-level hook — powerful, but you
  must implement retry, backoff, cache-bust, fallback, and telemetry yourself.
  `federation-resilience` is that implementation, packaged and property-tested.

## Where we deliberately stop

We do **not** patch every `import()` in your app (that's the generic helper's job),
and we do **not** make version/compliance decisions about *which* remote a user is
allowed to see. This package is generic resilience only.

# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-14

### Added
- **Core resilient loader** (`loadResilientRemote`): wraps Module Federation 2.0
  `loadRemote` with bounded retries, exponential backoff (configurable
  base/cap/factor/jitter), deterministic pinned fallback, and a single typed
  `RemoteLoadError` on give-up. Treats MF2's `null` resolution as a failed attempt.
- **Cache-busting** of every retry (`applyCacheBust` + a registered MF runtime
  plugin on `afterResolve`) to defeat Chromium's sticky failed-dynamic-import cache.
- **Idle fallback prefetch** (`prefetchFallback`): warms the fallback on
  `requestIdleCallback` (with a `setTimeout` fallback); guaranteed non-interfering.
- **Telemetry hooks**: `onAttempt`, `onRetry`, `onFallback`, `onSuccess`,
  `onGiveUp` — the only observability surface, invoked defensively.
- **React adapter** (`federation-resilience/react`): `useResilientRemote`,
  `<ResilientRemote>`, and a `React.lazy`/`<Suspense>`-compatible `lazyRemote`.
- **Five checkable correctness properties** (`checkBoundedTermination`,
  `checkFallbackSafety`, `checkBackoffMonotonicity`, `checkCacheBustIdempotence`,
  `checkPrefetchNonInterference`), each with a dedicated `fast-check` test at a
  fixed seed.
- **Benchmark harness** (`bench/harness.ts`): drives the real loader over scenario
  files and emits JSON (`success_rate`, `fallback_rate`, `giveup_rate`,
  `host_survival_rate`, `mean_attempts`, `recovery_ms` p50/p90/p99). Ships four
  SYNTHETIC scenarios.
- **Runnable example** (`examples/react-host`) demonstrating zero host crash and
  measured time-to-recover on a remote 500/timeout.
- Dual ESM + CJS builds via tsup; one canonical types module; CI matrix Node 18/20/22.
- Docs: animated self-contained `architecture.svg`, adapter guide, scenario
  provenance, social-preview spec, `data/README.md`.

### Security
- No tracing SDK or network-writing dependency bundled. `@module-federation/enhanced`
  and `react`/`react-dom` are peer dependencies.

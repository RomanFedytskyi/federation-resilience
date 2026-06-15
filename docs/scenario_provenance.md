# Scenario provenance

## Runtime API provenance (STEP 0)

The loader was written against a **confirmed inspection** of the actually-installed
package, not a remembered API:

- Package: `@module-federation/enhanced@2.5.1` (re-exports `@module-federation/runtime`).
- `loadRemote<T>(id: string, options?: { loadFactory?: boolean; from: CallFrom }): Promise<T | null>`
  — note it can resolve to **`null`**; the core treats `null` as a failed attempt.
- `preloadRemote(preloadOptions: Array<PreloadRemoteArgs>): Promise<void>`.
- `ModuleFederationRuntimePlugin` hooks confirmed present: `beforeRequest`,
  `afterResolve` (`AsyncWaterfallHook<LoadRemoteMatch>`, carries
  `remoteInfo.entry: string`), `onLoad`, `loadEntry`, `beforeLoadShare`,
  `errorLoadRemote`, `loadEntryError`. The cache-bust plugin uses `afterResolve`.
- Runtime entry `@module-federation/enhanced/runtime` exports `loadRemote`,
  `preloadRemote`, `registerPlugins`, `registerRemotes`, `getInstance`.

## Benchmark scenario provenance

The four files in `bench/scenarios/*.synthetic.json` are **SYNTHETIC**.

- They are **not** measured from any production remote.
- Latencies and outcome scripts are hand-authored to illustrate the loader's
  behaviour across the canonical failure modes (transient, permanent, slow/
  timeout, flapping).
- Every file carries `"synthetic": true` and a `_provenance` note.
- `entryUrl` values use the reserved `synthetic.invalid` domain and are never
  fetched by the harness.

To publish **real** numbers, supply your own files per `data/README.md`
with `"synthetic": false`, latencies measured from your RUM/APM, and a sibling
`*.provenance.md` documenting the measurement window and source.

## Licensing

The synthetic datasets are released under **CC-BY-4.0**; the code is **MIT**.

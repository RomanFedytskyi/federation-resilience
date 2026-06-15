# Contributing to federation-resilience

Thanks for your interest in improving **federation-resilience**! This project is a
small, focused library — a resilient loader for Module Federation remotes. We keep
the API surface tiny and the correctness guarantees explicit, so contributions are
held to that same bar.

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open a Bug issue with a minimal reproduction.
- **Request a feature** — open a Feature issue describing the failure mode it
  addresses. Please read [Scope](#scope--what-belongs-here) first.
- **Improve docs** — README, adapter guide, comparison, examples.
- **Submit a PR** — see the workflow below.

## Scope — what belongs here

This package is **generic resilience only**: retry, exponential backoff,
cache-busting, deterministic fallback, idle prefetch, and telemetry hooks for
federated remotes.

It deliberately does **not** include — and PRs adding these will be declined:

- compliance/approval gating or "which version is a user allowed to see" logic;
- an ordered version-resolution policy or a remote config service;
- feature-flag/OpenFeature types;
- audit-grade compliance/lineage logging;
- a bundled tracing SDK (telemetry is generic load-lifecycle events only).

If a feature smells like "decide which version a user is allowed to see," it does
not go here.

## Development setup

Requires Node 18, 20, or 22.

```bash
git clone git@github.com:RomanFedytskyi/federation-resilience.git
cd federation-resilience
npm install
```

Common scripts:

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest: unit + 5 fixed-seed property tests
npm run coverage      # with coverage thresholds
npm run build         # tsup → dual ESM + CJS + .d.ts
npm run validate:data # validate data/scenarios against data/README.md
npm run bench:data    # run the benchmark over the dataset
```

The runnable demo lives in `examples/react-host` (`npm install && npm run dev`).

## Project structure

```
src/types.ts            single canonical types module — import all types from here
src/core/*              backoff, cache-bust, fallback, prefetch, resilient-loader
src/telemetry/hooks.ts  the five lifecycle hooks
src/properties/*        the 5 resilience properties as checkable functions
src/adapters/*          vanilla (loadResilientRemote/prefetchFallback) + react
test/*                  vitest unit + one fast-check property test per property
bench/*                 CLI harness + SYNTHETIC scenarios
data/*                  schema-valid scenario dataset (+ validator)
```

## Coding standards

- **TypeScript strict.** No `any` in public APIs; keep types in `src/types.ts` —
  never redeclare a type that already lives there.
- **Tiny API surface.** New public exports need a clear justification in the PR.
- **Every exported function/component** has a doc comment stating *what* it does
  and *why* (the failure it prevents).
- **Framework-free core.** Anything React-specific belongs in `src/adapters/react.tsx`
  behind the optional subpath; the core must not import React.

## Tests & the five properties

- Every core module must keep **≥ 90% line coverage** (`npm run coverage`).
- The five resilience properties each have a dedicated **fast-check** test at a
  **fixed seed** (`0x5eed`) for reproducibility. If you change loader behaviour,
  update the matching `check*` function in `src/properties/properties.ts` **and**
  its property test.
- Tests run with **zero network** — use `test/mock-remote.ts`, never real remotes.

## Adding or changing scenario data

Scenario files must conform to [`data/README.md`](data/README.md) and
pass `npm run validate:data`. Real (non-synthetic) data must set `synthetic: false`
and ship a sibling `*.provenance.md`. Do not invent production URLs.

## Commit & PR workflow

1. Fork and branch from `main` (e.g. `feat/retry-budget`, `fix/null-resolution`).
2. Use **[Conventional Commits](https://www.conventionalcommits.org/)**:
   `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `perf:`.
3. Sign off each commit (DCO): `git commit -s`.
4. Before opening the PR: `npm run typecheck && npm test && npm run build` must pass.
5. Open the PR against `main`, fill in the template, and link any issue.
6. CI (Node 18/20/22) must be green; at least one maintainer review is required.

### Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/). Adding `-s` to your commit
appends a `Signed-off-by:` line certifying you wrote the patch or have the right
to submit it under the project's license.

## License of contributions

Code contributions are licensed under **MIT**; scenario data contributions under
**CC-BY-4.0** (consistent with the repository). By submitting a PR you agree your
contribution is provided under these terms.

## Releasing (maintainers)

1. Update `CHANGELOG.md` (Keep a Changelog) with the new version's entry.
2. Bump the version in `package.json` (SemVer).
3. Tag `vX.Y.Z` and push the tag; CI must pass.
4. Create the GitHub release from the tag, using the `CHANGELOG.md` entry as the release notes.
5. `npm publish --access public` (the `prepublishOnly` guard runs typecheck+build+test).

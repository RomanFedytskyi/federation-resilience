# `data/` — benchmark scenario dataset

Schema-valid scenario files consumed by the benchmark harness. They model a
realistic e-commerce micro-frontend fleet across every failure mode:

| File | Remote | Models | Fallback |
|---|---|---|---|
| `checkout-cart.json` | `checkout/Cart` | fail → timeout → recover (Friday peak) | pinned remote |
| `search-suggest.json` | `search/Suggest` | timeout → recover (slow origin) | pinned remote |
| `account-profile.json` | `account/Profile` | permanent outage (5xx) | pinned remote |
| `promo-banner.json` | `promo/Banner` | flapping, **no** fallback (optional UI) | none |
| `reviews-widget.json` | `reviews/Widget` | single transient 503 → recover | pinned remote |
| `recommendations-carousel.json` | `recommendations/Carousel` | healthy baseline (control) | pinned remote |

## Validate & benchmark

```bash
npm run validate:data   # checks every rule below
npm run bench:data      # runs the harness over data/scenarios → JSON
# or point the harness at any directory:
npx tsx bench/harness.ts --dir ./data/scenarios --seed 1234 --pretty
```

---

## Scenario JSON schema

Each scenario is one `.json` file.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | Unique, human-readable scenario id. |
| `synthetic` | boolean | yes | `true` for placeholders; `false` for real measured data. |
| `remote` | string | yes | The Module Federation remote id under test, e.g. `"checkout/Cart"`. |
| `entryUrl` | string (URL) | yes | The remote-entry URL the data was captured against (provenance only; never fetched). |
| `fallbackId` | string | no | The pinned fallback remote id. Omit to model "no fallback". |
| `runs` | integer ≥ 1 | yes | How many simulated loads to evaluate (e.g. 2000). |
| `config.maxAttempts` | integer ≥ 1 | yes | Passed straight to the loader. |
| `config.backoff` | object | no | `{ baseMs, capMs, factor, jitter }`; `jitter ∈ {"none","full","equal"}`. |
| `attempts` | array of AttemptSpec | yes | Per-attempt PRIMARY outcome script (see below). |
| `fallback` | AttemptSpec | no | Outcome + latency for the fallback load. Required if `fallbackId` is set. |

**AttemptSpec**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `outcome` | `"fail" \| "timeout" \| "succeed"` | yes | `timeout` is a failure that still costs `latencyMs`. |
| `latencyMs` | number ≥ 0 | yes | Time this attempt took (the measured/observed latency). |

**How `attempts` is consumed:** attempt *n* uses `attempts[n-1]`; if the loader
makes more attempts than entries, the **last** entry repeats. So a permanent
outage is a single `{ "outcome": "fail" }`; a "fails twice then recovers" remote
is three entries.

## Fully-filled template

```json
{
  "name": "checkout-cart-friday-peak",
  "synthetic": false,
  "remote": "checkout/Cart",
  "entryUrl": "https://cdn.example.com/checkout/remoteEntry.js",
  "fallbackId": "checkout-stable/Cart",
  "runs": 5000,
  "config": {
    "maxAttempts": 4,
    "backoff": { "baseMs": 100, "capMs": 2000, "factor": 2, "jitter": "full" }
  },
  "attempts": [
    { "outcome": "fail",    "latencyMs": 240 },
    { "outcome": "timeout", "latencyMs": 3000 },
    { "outcome": "succeed", "latencyMs": 180 }
  ],
  "fallback": { "outcome": "succeed", "latencyMs": 150 }
}
```

## Validation rules

1. `name` is unique across the directory.
2. `synthetic` MUST be `false` for any data you publish as real.
3. `remote` and (if present) `fallbackId` are non-empty strings.
4. `entryUrl` is a syntactically valid absolute URL.
5. `runs` is an integer ≥ 1 (use ≥ 1000 for stable percentiles).
6. `config.maxAttempts` is an integer ≥ 1.
7. If `config.backoff` is present: `baseMs ≥ 0`, `capMs ≥ baseMs`, `factor ≥ 1`,
   `jitter ∈ {"none","full","equal"}`.
8. `attempts` is non-empty; every entry has `outcome ∈ {"fail","timeout","succeed"}`
   and `latencyMs ≥ 0`.
9. If `fallbackId` is set, `fallback` MUST be present with a valid AttemptSpec.
10. Latencies are **observed** values (measured in RUM/APM), not guesses.

## Output

Per scenario the harness reports `success_rate`, `fallback_rate`, `giveup_rate`,
`host_survival_rate` (= success + fallback), `mean_attempts`, and
`recovery_ms.{p50,p90,p99}`. Output is a single JSON object on stdout.

> The files shipped here are **illustrative starter values** (modeled on a real
> storefront), each `"synthetic": false` with a `*.provenance.md` template.
> Replace `latencyMs` with measured percentiles and complete the provenance file.
> Fully-synthetic zero-setup placeholders live under
> [`../bench/scenarios/`](../bench/scenarios) (`"synthetic": true`).

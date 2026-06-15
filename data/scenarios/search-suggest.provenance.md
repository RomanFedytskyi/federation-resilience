# Provenance — search-suggest-slow-origin

> **Template — fill these in before publishing numbers from this scenario.**

- **Remote:** `search/Suggest`
- **Entry URL:** https://cdn.shop.example/search/remoteEntry.js
- **Fallback:** `search-stable/Suggest`
- **Measurement source:** <FILL IN — e.g. Datadog RUM, New Relic, Grafana>
- **Measurement window:** <FILL IN — e.g. 2026-06-01 to 2026-06-07, prod>
- **Sample size:** <FILL IN — number of real loads observed>
- **Latency basis:** <FILL IN — e.g. p50 of resource timing for remoteEntry.js>

## Notes

The `attempts[].latencyMs` and `fallback.latencyMs` in `search-suggest.json` are
**illustrative starter values**. Replace them with measured percentiles, then this
file documents exactly where those numbers came from so the benchmark is auditable.

# Provenance — reviews-widget-transient-recovery

> **Template — fill these in before publishing numbers from this scenario.**

- **Remote:** `reviews/Widget`
- **Entry URL:** https://cdn.shop.example/reviews/remoteEntry.js
- **Fallback:** `reviews-stable/Widget`
- **Measurement source:** <FILL IN — e.g. Datadog RUM, New Relic, Grafana>
- **Measurement window:** <FILL IN — e.g. 2026-06-01 to 2026-06-07, prod>
- **Sample size:** <FILL IN — number of real loads observed>
- **Latency basis:** <FILL IN — e.g. p50 of resource timing for remoteEntry.js>

## Notes

The `attempts[].latencyMs` and `fallback.latencyMs` in `reviews-widget.json` are
**illustrative starter values**. Replace them with measured percentiles, then this
file documents exactly where those numbers came from so the benchmark is auditable.

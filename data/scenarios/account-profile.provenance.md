# Provenance — account-profile-permanent-outage

> **Template — fill these in before publishing numbers from this scenario.**

- **Remote:** `account/Profile`
- **Entry URL:** https://cdn.shop.example/account/remoteEntry.js
- **Fallback:** `account-stable/Profile`
- **Measurement source:** <FILL IN — e.g. Datadog RUM, New Relic, Grafana>
- **Measurement window:** <FILL IN — e.g. 2026-06-01 to 2026-06-07, prod>
- **Sample size:** <FILL IN — number of real loads observed>
- **Latency basis:** <FILL IN — e.g. p50 of resource timing for remoteEntry.js>

## Notes

The `attempts[].latencyMs` and `fallback.latencyMs` in `account-profile.json` are
**illustrative starter values**. Replace them with measured percentiles, then this
file documents exactly where those numbers came from so the benchmark is auditable.

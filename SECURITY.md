# Security Policy

## Supported versions

federation-resilience is pre-1.0. Security fixes are released against the latest
published `0.x` version.

| Version | Supported |
|---------|-----------|
| latest `0.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately by either:

- GitHub → the repository's **Security** tab → **Report a vulnerability**
  (private advisory), or
- email **fedytskyi@gmail.com** with the details and a reproduction.

Please include affected version, impact, and steps to reproduce. We aim to
acknowledge reports within **72 hours** and to provide a remediation timeline
after triage. Coordinated disclosure is appreciated — we will credit reporters in
the release notes unless you prefer to remain anonymous.

## Scope notes

This library ships **no bundled tracing SDK** and makes **no network-writing
calls** of its own; its only runtime dependency surface is the host's Module
Federation runtime (a peer dependency) and, optionally, React. Telemetry is
limited to in-process load-lifecycle callbacks you provide.

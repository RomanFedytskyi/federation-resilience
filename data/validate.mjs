#!/usr/bin/env node
/**
 * Validates scenario JSON files against the data/README.md rules.
 * Usage: node data/validate.mjs [dir=data/scenarios]
 * Exit code 0 = all valid, 1 = at least one violation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? join(import.meta.dirname, "scenarios");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const seen = new Set();
let errors = 0;
const fail = (f, msg) => { console.error(`✗ ${f}: ${msg}`); errors++; };

const OUTCOMES = new Set(["fail", "timeout", "succeed"]);
const JITTERS = new Set(["none", "full", "equal"]);
const isInt = (n) => Number.isInteger(n);
const isUrl = (u) => { try { new URL(u); return true; } catch { return false; } };

for (const f of files) {
  let s;
  try { s = JSON.parse(readFileSync(join(dir, f), "utf8")); }
  catch (e) { fail(f, `invalid JSON: ${e.message}`); continue; }

  if (typeof s.name !== "string" || !s.name) fail(f, "name must be a non-empty string");
  if (seen.has(s.name)) fail(f, `duplicate name "${s.name}"`); else seen.add(s.name);
  if (typeof s.synthetic !== "boolean") fail(f, "synthetic must be boolean");
  if (typeof s.remote !== "string" || !s.remote) fail(f, "remote must be a non-empty string");
  if (!isUrl(s.entryUrl)) fail(f, "entryUrl must be a valid absolute URL");
  if (!isInt(s.runs) || s.runs < 1) fail(f, "runs must be an integer >= 1");
  if (!s.config || !isInt(s.config.maxAttempts) || s.config.maxAttempts < 1)
    fail(f, "config.maxAttempts must be an integer >= 1");

  const b = s.config?.backoff;
  if (b) {
    if (!(b.baseMs >= 0)) fail(f, "backoff.baseMs must be >= 0");
    if (!(b.capMs >= b.baseMs)) fail(f, "backoff.capMs must be >= baseMs");
    if (!(b.factor >= 1)) fail(f, "backoff.factor must be >= 1");
    if (!JITTERS.has(b.jitter)) fail(f, `backoff.jitter must be one of ${[...JITTERS]}`);
  }

  if (!Array.isArray(s.attempts) || s.attempts.length === 0)
    fail(f, "attempts must be a non-empty array");
  else for (const [i, a] of s.attempts.entries()) {
    if (!OUTCOMES.has(a.outcome)) fail(f, `attempts[${i}].outcome invalid`);
    if (!(a.latencyMs >= 0)) fail(f, `attempts[${i}].latencyMs must be >= 0`);
  }

  if (s.fallbackId !== undefined) {
    if (typeof s.fallbackId !== "string" || !s.fallbackId) fail(f, "fallbackId must be a non-empty string");
    if (!s.fallback || !OUTCOMES.has(s.fallback.outcome) || !(s.fallback.latencyMs >= 0))
      fail(f, "fallback (AttemptSpec) required when fallbackId is set");
  }

  if (errors === 0 || true) console.log(`✓ ${f} — "${s.name}" (synthetic=${s.synthetic})`);
}

console.log(`\n${files.length} file(s), ${errors} error(s).`);
process.exit(errors ? 1 : 0);

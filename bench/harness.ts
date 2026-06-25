/**
 * Benchmark harness — CLI that drives the REAL resilient loader over scenario
 * files and emits clean JSON metrics. Zero network: a simulated clock and a
 * scripted loader stand in for live remotes, so results are reproducible.
 *
 * Usage:
 *   tsx bench/harness.ts [--dir <scenarios-dir>] [--seed <int>] [--pretty]
 *
 * It loads *your* real scenario files from --dir (defaults to the bundled
 * SYNTHETIC set under bench/scenarios). See data/README.md for the schema.
 *
 * Metrics per scenario:
 *   success_rate   — fraction of runs the PRIMARY remote ultimately served.
 *   fallback_rate  — fraction served by the pinned fallback.
 *   giveup_rate    — fraction that ended in a RemoteLoadError.
 *   mean_attempts  — mean primary attempts per run.
 *   recovery_ms    — p50/p90/p99 simulated time-to-usable-module.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { resilientLoad } from "../src/core/resilient-loader.js";
import { RemoteLoadError } from "../src/types.js";
import type { BackoffOptions } from "../src/types.js";

type Outcome = "fail" | "timeout" | "succeed";

interface AttemptSpec {
  outcome: Outcome;
  latencyMs: number;
}
/**
 * Optional stochastic failure model. When present, each PRIMARY attempt draws an
 * outcome i.i.d. from `perAttemptOutcome` (the measured RUM class mix) instead of
 * following the fixed `attempts` script, and per-attempt latency is jittered
 * around the per-class percentile. This injects realistic run-to-run variance
 * (fractional mean-attempts, occasional fallback/give-up, spread recovery times).
 */
interface FailureModel {
  perAttemptOutcome: { succeed: number; fail: number; timeout: number };
  latencyMs: { succeed: number; fail: number; timeout: number };
  latencyJitter?: number; // +/- fractional jitter, default 0.15
  fallbackFails?: boolean; // adversarial: pinned fallback also fails
  nativeSurvival?: number; // native loadRemote survival = P(first attempt succeeds)
}
interface Scenario {
  name: string;
  synthetic: boolean;
  remote: string;
  entryUrl: string;
  fallbackId?: string;
  runs: number;
  config: { maxAttempts: number; backoff?: Partial<BackoffOptions> };
  attempts: AttemptSpec[];
  fallback?: AttemptSpec;
  failureModel?: FailureModel;
}

/** Draw a primary-attempt outcome from the class mix using one uniform sample. */
function drawOutcome(
  m: { succeed: number; fail: number; timeout: number },
  u: number,
): Outcome {
  if (u < m.succeed) return "succeed";
  if (u < m.succeed + m.fail) return "fail";
  return "timeout";
}

/** Multiplicative +/- jitter so per-attempt latencies are not all identical. */
function jitterLatency(base: number, frac: number, u: number): number {
  return Math.max(1, Math.round(base * (1 + (u * 2 - 1) * frac)));
}

/** Deterministic, seedable PRNG (mulberry32) for reproducible jitter. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

interface RunResult {
  served: "primary" | "fallback" | "giveup";
  attempts: number;
  recoveryMs: number;
}

/** Execute one simulated load through the real resilientLoad with a sim clock. */
async function runOnce(sc: Scenario, rng: () => number): Promise<RunResult> {
  let elapsed = 0; // simulated milliseconds
  let attemptsMade = 0;

  // Injected sleep: advances the simulated clock instead of real waiting.
  const sleep = async (ms: number) => {
    elapsed += ms;
  };

  // Scripted loader. With a `failureModel`, each primary attempt draws an
  // outcome i.i.d. from the measured RUM class mix and a jittered latency
  // (realistic run-to-run variance). Without one, it falls back to the fixed
  // per-attempt script. "timeout" is a failure that still costs its latency.
  const fm = sc.failureModel;
  const jit = fm?.latencyJitter ?? 0.15;
  const load = async (_id: string, ctx: { attempt: number; isFallback: boolean }) => {
    if (ctx.isFallback) {
      const fb = sc.fallback ?? { outcome: "succeed", latencyMs: 100 };
      elapsed += jitterLatency(fb.latencyMs, jit, rng());
      if (fm ? !fm.fallbackFails : fb.outcome === "succeed") return { module: "fallback" };
      throw new Error("fallback failed");
    }
    attemptsMade += 1;
    if (fm) {
      const outcome = drawOutcome(fm.perAttemptOutcome, rng());
      elapsed += jitterLatency(fm.latencyMs[outcome], jit, rng());
      if (outcome === "succeed") return { module: "primary" };
      throw new Error(outcome); // "fail" | "timeout"
    }
    const spec = sc.attempts[Math.min(ctx.attempt - 1, sc.attempts.length - 1)]!;
    elapsed += spec.latencyMs;
    if (spec.outcome === "succeed") return { module: "primary" };
    throw new Error(spec.outcome); // "fail" | "timeout"
  };

  try {
    const mod = (await resilientLoad(sc.remote, {
      load,
      maxAttempts: sc.config.maxAttempts,
      backoff: sc.config.backoff,
      sleep,
      random: rng,
      ...(sc.fallbackId ? { fallback: sc.fallbackId } : {}),
    })) as { module: string };
    return {
      served: mod.module === "fallback" ? "fallback" : "primary",
      attempts: attemptsMade,
      recoveryMs: elapsed,
    };
  } catch (e) {
    if (!(e instanceof RemoteLoadError)) throw e;
    return { served: "giveup", attempts: attemptsMade, recoveryMs: elapsed };
  }
}

async function evaluate(sc: Scenario, seed: number) {
  const rng = mulberry32(seed ^ hash(sc.name));
  const results: RunResult[] = [];
  for (let i = 0; i < sc.runs; i++) results.push(await runOnce(sc, rng));

  const n = results.length || 1;
  const primary = results.filter((r) => r.served === "primary").length;
  const fallback = results.filter((r) => r.served === "fallback").length;
  const giveup = results.filter((r) => r.served === "giveup").length;
  const recov = results
    .filter((r) => r.served !== "giveup")
    .map((r) => r.recoveryMs)
    .sort((a, b) => a - b);

  return {
    scenario: sc.name,
    synthetic: sc.synthetic === true,
    runs: sc.runs,
    success_rate: round(primary / n),
    fallback_rate: round(fallback / n),
    giveup_rate: round(giveup / n),
    host_survival_rate: round((primary + fallback) / n), // never a crash
    // Native loadRemote (single attempt, no retry/fallback) survives iff its one
    // attempt succeeds; = the measured success-class share of the RUM mix.
    native_survival_rate: round(sc.failureModel?.nativeSurvival ?? (sc.attempts[0]?.outcome === "succeed" ? 1 : 0)),
    mean_attempts: round(results.reduce((s, r) => s + r.attempts, 0) / n),
    recovery_ms: {
      p50: Math.round(percentile(recov, 50)),
      p90: Math.round(percentile(recov, 90)),
      p99: Math.round(percentile(recov, 99)),
    },
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const round = (x: number) => Math.round(x * 10000) / 10000;

function parseArgs(argv: string[]) {
  const out: { dir?: string; seed: number; pretty: boolean } = {
    seed: 1234,
    pretty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") out.dir = argv[++i];
    else if (argv[i] === "--seed") out.seed = Number(argv[++i]);
    else if (argv[i] === "--pretty") out.pretty = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.dir ?? join(import.meta.dirname, "scenarios"));
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const scenarios = files.map(
    (f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Scenario,
  );
  const report = {
    tool: "federation-resilience/bench",
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    scenarioDir: dir,
    results: [] as unknown[],
  };
  for (const sc of scenarios) report.results.push(await evaluate(sc, args.seed));
  process.stdout.write(JSON.stringify(report, null, args.pretty ? 2 : 0) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

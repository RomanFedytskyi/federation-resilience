import { useEffect, useRef, useState } from "react";
import { useResilientRemote, type ResilientLoadOptions } from "federation-resilience/react";
import { loadResilientRemotes, type MultiRemoteResult } from "federation-resilience";
import type { RetryEvent, FallbackEvent } from "federation-resilience";
import {
  DEMOS,
  PARALLEL_REMOTES,
  makeScenarioLoad,
  makeParallelLoad,
  NotFoundError,
  type CartModule,
  type DemoId,
} from "./scenarioLoader";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface LogLine {
  t: number;
  kind: "attempt" | "retry" | "retry-timeout" | "fallback" | "success" | "giveup";
  text: string;
}

const COLOR: Record<string, string> = {
  attempt: "#93a4c8",
  retry: "#f59e0b",
  "retry-timeout": "#fb923c",
  fallback: "#a855f7",
  success: "#22c55e",
  giveup: "#ef4444",
};

function Tag({ kind }: { kind: string }) {
  return (
    <span style={{ color: COLOR[kind] ?? "#888", fontWeight: 600 }}>
      [{kind}]
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single-remote demo (fail-recover / timeout / retryIf)
// ---------------------------------------------------------------------------

function SingleRemoteDemo({ demoId }: { demoId: DemoId }) {
  const demo = DEMOS.find((d) => d.id === demoId)!;
  const [nonce, setNonce] = useState(0);
  return (
    <RemoteShell
      key={`${demoId}-${nonce}`}
      demoId={demoId}
      onRerun={() => setNonce((n) => n + 1)}
    />
  );
}

function RemoteShell({ demoId, onRerun }: { demoId: DemoId; onRerun: () => void }) {
  const demo = DEMOS.find((d) => d.id === demoId)!;
  const [log, setLog] = useState<LogLine[]>([]);
  const start = useRef(performance.now());

  const push = (kind: LogLine["kind"], text: string) =>
    setLog((l) => [...l, { t: Math.round(performance.now() - start.current), kind, text }]);

  const options: ResilientLoadOptions<CartModule> = {
    load: makeScenarioLoad(demo.scenario),
    maxAttempts: demo.scenario.config.maxAttempts,
    backoff: demo.scenario.config.backoff as ResilientLoadOptions<CartModule>["backoff"],
    fallback: demo.scenario.fallbackId,
    ...demo.extraOptions,
    telemetry: {
      onAttempt: (e) =>
        push("attempt", `Attempt ${e.attempt}/${e.maxAttempts} → loadRemote("${e.remoteId}")`),
      onRetry: (e: RetryEvent) => {
        const errMsg = e.error instanceof NotFoundError
          ? e.error.message
          : (e.error as Error).message;
        const kind = e.timedOut ? "retry-timeout" : "retry";
        push(kind, `Attempt ${e.attempt} failed${e.timedOut ? " (timed out)" : ""} — "${errMsg}". Cache-busted retry in ${e.delayMs}ms.`);
      },
      onFallback: (e: FallbackEvent) =>
        push("fallback", `${e.attemptsMade} attempt(s) failed → loading pinned ${e.fallbackKind} fallback.`),
      onSuccess: (e) =>
        push("success", `Resolved via ${e.viaFallback ? "FALLBACK" : "primary"} on attempt ${e.attempt}.`),
      onGiveUp: (e) =>
        push("giveup", `Gave up: ${e.error.message}`),
    },
  };

  const { status, module, error } = useResilientRemote<CartModule>("checkout/Cart", options);

  const [recoverMs, setRecoverMs] = useState<number | null>(null);
  useEffect(() => {
    if (status === "success" || status === "error")
      setRecoverMs(Math.round(performance.now() - start.current));
  }, [status]);

  return (
    <div>
      {/* Cart slot */}
      <div style={{ border: "1px solid #1f2b4a", borderRadius: 10, padding: 16, background: "#0d1526", minHeight: 72 }}>
        <strong style={{ color: "#c7d2fe", fontSize: 13 }}>checkout/Cart slot</strong>
        <div style={{ marginTop: 8 }}>
          {status === "loading" && <em style={{ color: "#93a4c8" }}>Loading… (resilience running)</em>}
          {status === "success" && module && (
            <span style={{ color: module.source === "fallback" ? "#a855f7" : "#22c55e" }}>
              ✓ {module.label}
            </span>
          )}
          {status === "error" && (
            <span style={{ color: "#ef4444" }}>Cart unavailable — {error.message}</span>
          )}
        </div>
      </div>

      {recoverMs != null && (
        <p style={{ margin: "10px 0 0", fontSize: 13 }}>
          <strong>Time-to-recover:</strong>{" "}
          <span style={{ color: "#22c55e", fontWeight: 700 }}>{recoverMs} ms</span>{" "}
          <span style={{ color: "#6b7aa3" }}>· host crashes: 0</span>
        </p>
      )}

      <button
        onClick={onRerun}
        style={{ marginTop: 10, padding: "6px 14px", borderRadius: 7, border: "1px solid #3b82f6", background: "#14233f", color: "#e6ecff", cursor: "pointer", fontSize: 13 }}
      >
        Run again ↺
      </button>

      {/* Telemetry */}
      <h4 style={{ marginTop: 18, marginBottom: 6, color: "#c7d2fe" }}>Telemetry timeline</h4>
      <ol style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.8, color: "#cdd6f4", paddingLeft: 20 }}>
        {log.length === 0 && <li style={{ color: "#6b7aa3" }}>waiting…</li>}
        {log.map((l, i) => (
          <li key={i}>
            <span style={{ color: "#6b7aa3" }}>+{l.t}ms </span>
            <Tag kind={l.kind} /> {l.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parallel remotes demo (loadResilientRemotes)
// ---------------------------------------------------------------------------

type ParallelStatus = "idle" | "running" | "done";

function ParallelDemo() {
  const [status, setStatus] = useState<ParallelStatus>("idle");
  const [results, setResults] = useState<MultiRemoteResult<CartModule>[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function run() {
    setStatus("running");
    setResults([]);
    setElapsedMs(null);
    const t0 = performance.now();
    const entries = PARALLEL_REMOTES.map((spec) => ({
      remoteId: spec.id,
      options: {
        load: makeParallelLoad(spec),
        maxAttempts: 3,
        backoff: { baseMs: 80, capMs: 600, factor: 2, jitter: "none" as const },
        fallback: `${spec.id}-stable`,
      },
    }));
    const res = await loadResilientRemotes<CartModule>(entries);
    setResults(res);
    setElapsedMs(Math.round(performance.now() - t0));
    setStatus("done");
  }

  return (
    <div>
      <p style={{ color: "#93a4c8", fontSize: 13, marginTop: 0 }}>
        Four remotes fire in parallel. Nav retries twice, Promo always fails (served by fallback),
        others succeed on first attempt. One failure never blocks the rest.
      </p>
      <button
        onClick={run}
        disabled={status === "running"}
        style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #3b82f6", background: "#14233f", color: "#e6ecff", cursor: status === "running" ? "default" : "pointer", fontSize: 13 }}
      >
        {status === "running" ? "Loading…" : status === "done" ? "Run again ↺" : "Run parallel loads"}
      </button>

      {elapsedMs != null && (
        <span style={{ marginLeft: 12, color: "#22c55e", fontSize: 13 }}>
          All 4 settled in <strong>{elapsedMs} ms</strong>
        </span>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {results.map((r) => {
            const spec = PARALLEL_REMOTES.find((s) => s.id === r.remoteId)!;
            const ok = r.status === "success";
            return (
              <div
                key={r.remoteId}
                style={{
                  border: `1px solid ${ok ? "#1a3a1a" : "#3a1a1a"}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  background: ok ? "#0d1e0d" : "#1e0d0d",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: "#c7d2fe" }}>{spec.label}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: ok ? (r.module?.source === "fallback" ? "#a855f7" : "#22c55e") : "#ef4444" }}>
                  {ok
                    ? `✓ ${r.module?.label}`
                    : `✗ ${r.error.message}`}
                </div>
                <div style={{ fontSize: 11, marginTop: 3, color: "#6b7aa3" }}>{r.remoteId}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  const [activeDemo, setActiveDemo] = useState<DemoId>("fail-recover");

  const currentDemo = DEMOS.find((d) => d.id === activeDemo)!;

  const tab = (id: DemoId, label: string) => (
    <button
      key={id}
      onClick={() => setActiveDemo(id)}
      style={{
        padding: "5px 14px",
        borderRadius: 6,
        border: `1px solid ${activeDemo === id ? "#3b82f6" : "#1f2b4a"}`,
        background: activeDemo === id ? "#1a2f5c" : "#0d1526",
        color: activeDemo === id ? "#e6ecff" : "#6b7aa3",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 28, fontFamily: "system-ui, sans-serif", color: "#cdd6f4" }}>
      {/* Header */}
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 2 }}>
        federation-resilience <span style={{ color: "#22c55e", fontSize: 18 }}>● shell alive</span>
      </h1>
      <p style={{ color: "#93a4c8", marginTop: 4, marginBottom: 24, fontSize: 14 }}>
        The host shell always renders. Broken remotes retry, time out, or skip to fallback — never crash the page.
      </p>

      {/* ── Section 1: Single remote demos ── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#c7d2fe" }}>
          Single remote — scenario demos
        </h2>

        {/* Scenario tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {DEMOS.map((d) => tab(d.id, d.label))}
        </div>

        {/* Active scenario description */}
        <div style={{ background: "#0d1526", border: "1px solid #1f2b4a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#93a4c8" }}>
          <strong style={{ color: "#c7d2fe" }}>{currentDemo.label}:</strong>{" "}
          {currentDemo.description}
          {activeDemo === "timeout" && (
            <span style={{ color: "#fb923c" }}> — <code>timeoutMs: 800</code></span>
          )}
          {activeDemo === "retry-if" && (
            <span style={{ color: "#a855f7" }}> — <code>retryIf: (err) =&gt; !(err instanceof NotFoundError)</code></span>
          )}
        </div>

        <SingleRemoteDemo key={activeDemo} demoId={activeDemo} />
      </section>

      {/* ── Section 2: Parallel remotes ── */}
      <section style={{ borderTop: "1px solid #1f2b4a", paddingTop: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#c7d2fe" }}>
          Parallel remotes — <code style={{ fontSize: 14 }}>loadResilientRemotes</code>
        </h2>
        <ParallelDemo />
      </section>
    </div>
  );
}

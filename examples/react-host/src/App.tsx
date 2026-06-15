import { useEffect, useRef, useState } from "react";
import { useResilientRemote, type ResilientLoadOptions } from "federation-resilience/react";
import type { RetryEvent, FallbackEvent } from "federation-resilience";
import { makeScenarioLoad, exampleScenario, type CartModule } from "./scenarioLoader";

interface LogLine {
  t: number;
  kind: "attempt" | "retry" | "fallback" | "success" | "giveup";
  text: string;
}

export default function App() {
  const [log, setLog] = useState<LogLine[]>([]);
  const [nonce, setNonce] = useState(0); // re-trigger the demo
  const start = useRef(performance.now());

  const push = (kind: LogLine["kind"], text: string) =>
    setLog((l) => [...l, { t: Math.round(performance.now() - start.current), kind, text }]);

  // Wire the resilient loader to the scenario-driven fake remote + telemetry.
  const options: ResilientLoadOptions<CartModule> = {
    load: makeScenarioLoad(),
    maxAttempts: exampleScenario.config.maxAttempts,
    backoff: exampleScenario.config.backoff as ResilientLoadOptions<CartModule>["backoff"],
    fallback: exampleScenario.fallbackId,
    telemetry: {
      onAttempt: (e) => push("attempt", `Attempt ${e.attempt}/${e.maxAttempts} → loadRemote("${e.remoteId}")`),
      onRetry: (e: RetryEvent) =>
        push("retry", `Attempt ${e.attempt} failed (${String((e.error as Error).message)}). Cache-busted retry in ${e.delayMs}ms.`),
      onFallback: (e: FallbackEvent) =>
        push("fallback", `All ${e.attemptsMade} attempts failed → loading pinned ${e.fallbackKind} fallback.`),
      onSuccess: (e) => push("success", `Resolved via ${e.viaFallback ? "FALLBACK" : "primary"} on attempt ${e.attempt}.`),
      onGiveUp: (e) => push("giveup", `Gave up: ${e.error.message}`),
    },
  };

  // key on nonce so "Run again" re-mounts the hook
  return <Shell key={nonce} options={options} log={log} onRerun={() => { setLog([]); start.current = performance.now(); setNonce((n) => n + 1); }} />;
}

function Shell({
  options,
  log,
  onRerun,
}: {
  options: ResilientLoadOptions<CartModule>;
  log: LogLine[];
  onRerun: () => void;
}) {
  const { status, module, error } = useResilientRemote<CartModule>("checkout/Cart", options);
  const [recoverMs, setRecoverMs] = useState<number | null>(null);
  const start = useRef(performance.now());
  useEffect(() => {
    if (status === "success" || status === "error") {
      setRecoverMs(Math.round(performance.now() - start.current));
    }
  }, [status]);

  const color: Record<string, string> = {
    attempt: "#93a4c8", retry: "#f59e0b", fallback: "#a855f7", success: "#22c55e", giveup: "#ef4444",
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 28 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>
        Storefront shell <span style={{ color: "#22c55e" }}>● alive</span>
      </h1>
      <p style={{ color: "#93a4c8", marginTop: -6 }}>
        The rest of the page (this shell, nav, footer) renders normally while the
        <code style={{ color: "#c7d2fe" }}> checkout/Cart </code> remote is failing.
        That is the whole point: a bad remote never crashes the host.
      </p>

      {/* The "cart slot" — degrades gracefully, never crashes the shell */}
      <div style={{ border: "1px solid #1f2b4a", borderRadius: 12, padding: 18, background: "#11182e", minHeight: 90 }}>
        <strong style={{ color: "#c7d2fe" }}>Cart slot</strong>
        <div style={{ marginTop: 8 }}>
          {status === "loading" && <em style={{ color: "#93a4c8" }}>Loading cart… (retrying through the outage)</em>}
          {status === "success" && module && (
            <span style={{ color: module.source === "fallback" ? "#a855f7" : "#22c55e" }}>
              ✓ {module.label}
            </span>
          )}
          {status === "error" && (
            <span style={{ color: "#ef4444" }}>Cart unavailable — {error.message} (shell still fine)</span>
          )}
        </div>
      </div>

      {recoverMs != null && (
        <p style={{ marginTop: 14 }}>
          <strong>Time-to-recover:</strong>{" "}
          <span style={{ color: "#22c55e", fontWeight: 700 }}>{recoverMs} ms</span>{" "}
          <span style={{ color: "#6b7aa3" }}>(host crashes: 0)</span>
        </p>
      )}

      <button
        onClick={onRerun}
        style={{ marginTop: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #3b82f6", background: "#14233f", color: "#e6ecff", cursor: "pointer" }}
      >
        Run again
      </button>

      <h3 style={{ marginTop: 24 }}>Telemetry timeline</h3>
      <ol style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, lineHeight: 1.7, color: "#cdd6f4" }}>
        {log.map((l, i) => (
          <li key={i}>
            <span style={{ color: "#6b7aa3" }}>+{l.t}ms </span>
            <span style={{ color: color[l.kind] }}>[{l.kind}]</span> {l.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

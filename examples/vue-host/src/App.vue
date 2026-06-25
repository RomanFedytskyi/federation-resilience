<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useResilientRemote } from "federation-resilience/vue";
import type { RetryEvent, FallbackEvent, ResilientLoadOptions } from "federation-resilience";
import {
  SCENARIOS,
  makeLoad,
  NotFoundError,
  type CartModule,
  type ScenarioDef,
} from "./scenarioLoader";

// ---------------------------------------------------------------------------
// Scenario selection + nonce (re-mounts demo on "run again")
// ---------------------------------------------------------------------------
const activeId = ref<string>("fail-recover");
const nonce = ref(0);

const activeScenario = computed<ScenarioDef>(
  () => SCENARIOS.find((s) => s.id === activeId.value)!,
);

function selectScenario(id: string) {
  activeId.value = id;
  resetDemo();
}

// ---------------------------------------------------------------------------
// Telemetry log
// ---------------------------------------------------------------------------
interface LogLine {
  t: number;
  kind: "attempt" | "retry" | "retry-timeout" | "fallback" | "success" | "giveup";
  text: string;
}

const log = ref<LogLine[]>([]);
const startMs = ref(performance.now());
const recoverMs = ref<number | null>(null);

function push(kind: LogLine["kind"], text: string) {
  log.value = [...log.value, { t: Math.round(performance.now() - startMs.value), kind, text }];
}

const COLOR: Record<string, string> = {
  attempt: "#93a4c8",
  retry: "#f59e0b",
  "retry-timeout": "#fb923c",
  fallback: "#a855f7",
  success: "#22c55e",
  giveup: "#ef4444",
};

// ---------------------------------------------------------------------------
// Resilient load — reactive options keyed on nonce so "run again" re-triggers
// ---------------------------------------------------------------------------
const remoteId = computed(() => `${activeScenario.value.remoteId}-${nonce.value}`);

const options = computed<ResilientLoadOptions<CartModule>>(() => ({
  load: makeLoad(activeScenario.value),
  maxAttempts: activeScenario.value.maxAttempts,
  backoff: { baseMs: 100, capMs: 1000, factor: 2, jitter: "none" },
  fallback: activeScenario.value.fallbackId,
  ...(activeScenario.value.timeoutMs ? { timeoutMs: activeScenario.value.timeoutMs } : {}),
  ...(activeScenario.value.retryIf   ? { retryIf:   activeScenario.value.retryIf   } : {}),
  telemetry: {
    onAttempt: (e) =>
      push("attempt", `Attempt ${e.attempt}/${e.maxAttempts} → loadRemote("${activeScenario.value.remoteId}")`),
    onRetry: (e: RetryEvent) => {
      const msg = e.error instanceof NotFoundError
        ? e.error.message
        : (e.error as Error).message;
      const kind = e.timedOut ? "retry-timeout" : "retry";
      push(kind, `Attempt ${e.attempt} failed${e.timedOut ? " (timed out)" : ""} — "${msg}". Retry in ${e.delayMs}ms.`);
    },
    onFallback: (e: FallbackEvent) =>
      push("fallback", `${e.attemptsMade} attempt(s) failed → loading ${e.fallbackKind} fallback.`),
    onSuccess: (e) =>
      push("success", `Resolved via ${e.viaFallback ? "FALLBACK" : "primary"} on attempt ${e.attempt}.`),
    onGiveUp: (e) =>
      push("giveup", `Gave up after ${e.attemptsMade} attempt(s): ${e.error.message}`),
  },
}));

// useResilientRemote accepts a Ref<string> — re-fires automatically when remoteId changes.
const state = useResilientRemote<CartModule>(remoteId, options.value);

// Watch for settlement to record recovery time.
watch(
  () => state.value.status,
  (s) => {
    if (s === "success" || s === "error") {
      recoverMs.value = Math.round(performance.now() - startMs.value);
    }
  },
);

function resetDemo() {
  log.value = [];
  recoverMs.value = null;
  startMs.value = performance.now();
  nonce.value++;
}
</script>

<template>
  <div style="max-width: 860px; margin: 0 auto; padding: 28px;">
    <!-- Header -->
    <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">
      federation-resilience
      <span style="color: #22c55e; font-size: 18px;">● shell alive</span>
    </h1>
    <p style="color: #93a4c8; font-size: 14px; margin-top: 4px; margin-bottom: 28px;">
      Vue 3 demo — the host shell always renders. Broken remotes retry, time out, or skip to fallback.
    </p>

    <!-- Scenario tabs -->
    <div style="display: flex; gap: 6px; margin-bottom: 14px;">
      <button
        v-for="s in SCENARIOS"
        :key="s.id"
        @click="selectScenario(s.id)"
        :style="{
          padding: '5px 14px',
          borderRadius: '6px',
          border: `1px solid ${activeId === s.id ? '#3b82f6' : '#1f2b4a'}`,
          background: activeId === s.id ? '#1a2f5c' : '#0d1526',
          color: activeId === s.id ? '#e6ecff' : '#6b7aa3',
          cursor: 'pointer',
          fontSize: '13px',
        }"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- Scenario description -->
    <div style="background: #0d1526; border: 1px solid #1f2b4a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #93a4c8;">
      <strong style="color: #c7d2fe;">{{ activeScenario.label }}:</strong>
      {{ activeScenario.description }}
      <span v-if="activeScenario.timeoutMs" style="color: #fb923c;">
        — <code>timeoutMs: {{ activeScenario.timeoutMs }}</code>
      </span>
      <span v-if="activeScenario.retryIf" style="color: #a855f7;">
        — <code>retryIf: (err) =&gt; !(err instanceof NotFoundError)</code>
      </span>
    </div>

    <!-- Remote slot -->
    <div style="border: 1px solid #1f2b4a; border-radius: 10px; padding: 16px; background: #0d1526; min-height: 72px;">
      <strong style="color: #c7d2fe; font-size: 13px;">{{ activeScenario.remoteId }} slot</strong>
      <div style="margin-top: 8px;">
        <em v-if="state.status === 'loading'" style="color: #93a4c8;">
          Loading… (resilience running)
        </em>
        <span
          v-else-if="state.status === 'success' && state.module"
          :style="{ color: state.module.source === 'fallback' ? '#a855f7' : '#22c55e' }"
        >
          ✓ {{ state.module.label }}
        </span>
        <span v-else-if="state.status === 'error'" style="color: #ef4444;">
          Cart unavailable — {{ state.error?.message }}
        </span>
      </div>
    </div>

    <!-- Recovery time -->
    <p v-if="recoverMs !== null" style="font-size: 13px; margin: 10px 0 0;">
      <strong>Time-to-recover:</strong>
      <span style="color: #22c55e; font-weight: 700;"> {{ recoverMs }} ms</span>
      <span style="color: #6b7aa3;"> · host crashes: 0</span>
    </p>

    <!-- Run again -->
    <button
      @click="resetDemo"
      style="margin-top: 10px; padding: 6px 14px; border-radius: 7px; border: 1px solid #3b82f6; background: #14233f; color: #e6ecff; cursor: pointer; font-size: 13px;"
    >
      Run again ↺
    </button>

    <!-- Telemetry log -->
    <h4 style="margin-top: 20px; margin-bottom: 6px; color: #c7d2fe;">Telemetry timeline</h4>
    <ol style="font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.8; color: #cdd6f4; padding-left: 20px;">
      <li v-if="log.length === 0" style="color: #6b7aa3;">waiting…</li>
      <li v-for="(line, i) in log" :key="i">
        <span style="color: #6b7aa3;">+{{ line.t }}ms </span>
        <span :style="{ color: COLOR[line.kind] ?? '#888', fontWeight: 600 }">[{{ line.kind }}]</span>
        {{ line.text }}
      </li>
    </ol>

    <!-- Vue-specific note -->
    <div style="margin-top: 28px; padding: 14px; border: 1px solid #1a2f1a; border-radius: 8px; background: #0d1a0d; font-size: 13px; color: #6b9b6b;">
      <strong style="color: #a3d9a3;">How this works in Vue:</strong>
      <code style="display: block; margin-top: 8px; color: #cdd6f4; font-size: 12px; line-height: 1.7;">
        import { useResilientRemote } from "federation-resilience/vue";<br/>
        <br/>
        // plain string — fires once<br/>
        const state = useResilientRemote("checkout/Cart", { fallback: "checkout-stable/Cart" });<br/>
        <br/>
        // reactive Ref — re-fires when the ref changes (route-driven remotes)<br/>
        const remoteId = ref("checkout/Cart");<br/>
        const state = useResilientRemote(remoteId, { fallback: "checkout-stable/Cart" });<br/>
      </code>
    </div>
  </div>
</template>

<template>
  <section class="roundness-preview">
    <header class="roundness-toolbar">
      <div>
        <strong>Stick roundness</strong>
        <small>{{ active ? "Rotate both sticks around the full outer gate" : "Start to capture 16 outer directions" }}</small>
      </div>
      <div>
        <button type="button" :class="{ active }" @click="toggle">
          {{ active ? "Stop test" : "Test roundness" }}
        </button>
        <button type="button" :disabled="!hasSamples" @click="reset">Reset</button>
      </div>
    </header>

    <div class="roundness-stick-grid">
      <article v-for="(stick, index) in sticks" :key="stick.label" class="roundness-stick">
        <header>
          <strong>{{ stick.label }}</strong>
          <span>{{ stick.result.coverage }}/16</span>
        </header>
        <svg viewBox="-116 -116 232 232" role="img" :aria-label="`${stick.label} position and roundness`">
          <circle cx="0" cy="0" r="100" class="roundness-target-circle" />
          <line x1="-100" y1="0" x2="100" y2="0" />
          <line x1="0" y1="-100" x2="0" y2="100" />
          <polygon
            v-if="stick.result.coverage === 16"
            :points="stick.trace"
            class="roundness-trace"
          />
          <circle :cx="stick.x * 100" :cy="stick.y * 100" r="6" class="roundness-position-dot" />
        </svg>
        <dl>
          <div>
            <dt>Roundness error</dt>
            <dd>{{ formatError(stick.result.errorPercent) }}</dd>
          </div>
          <div>
            <dt>Radius min / max</dt>
            <dd>{{ formatRange(stick.result) }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import {
  analyzeRoundnessCapture,
  createRoundnessCapture,
  recordRoundnessSample,
  roundnessTracePoints,
} from "../roundness.js";

const props = defineProps({
  stickValues: { type: Array, required: true },
});

const active = ref(false);
const captures = ref([createRoundnessCapture(), createRoundnessCapture()]);
const hasSamples = computed(() => captures.value.some((capture) => capture.sampleCount > 0));

const sticks = computed(() => [0, 1].map((index) => {
  const offset = index * 2;
  const capture = captures.value[index];
  return {
    label: index ? "Right stick" : "Left stick",
    x: clamp(props.stickValues[offset]),
    y: clamp(props.stickValues[offset + 1]),
    result: analyzeRoundnessCapture(capture),
    trace: roundnessTracePoints(capture),
  };
}));

/**
 * Clamp a live coordinate to the visual range while preserving finite input.
 */
function clamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(-1.1, Math.min(1.1, numeric)) : 0;
}

/**
 * Clear both fixed-size roundness accumulators.
 */
function reset() {
  captures.value = [createRoundnessCapture(), createRoundnessCapture()];
}

/**
 * Start a fresh capture or stop while preserving its result.
 */
function toggle() {
  if (!active.value) {
    reset();
  }
  active.value = !active.value;
}

function formatError(value) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatRange(result) {
  if (result.minRadius == null || result.maxRadius == null) {
    return "—";
  }
  return `${result.minRadius.toFixed(3)} / ${result.maxRadius.toFixed(3)}`;
}

watch(
  () => props.stickValues,
  (values) => {
    if (!active.value || !Array.isArray(values) || values.length < 4) {
      return;
    }
    captures.value = captures.value.map((capture, index) => (
      recordRoundnessSample(capture, values[index * 2], values[index * 2 + 1])
    ));
  },
  { deep: true },
);
</script>

<template>
  <section class="curve-editor">
    <div class="response-head">
      <strong>{{ label }}</strong>
      <select :value="preset" @change="applyPreset($event.target.value)">
        <option value="linear">Linear</option>
        <option value="centerPrecise">Center Precise</option>
        <option value="centerAggressive">Center Aggressive</option>
        <option value="earlyFull">Early Full</option>
        <option value="custom">Custom</option>
      </select>
    </div>
    <div class="deadzone-grid">
      <label>
        <span>Inner deadzone {{ percent(modelValue.inner_deadzone_q15) }}%</span>
        <input
          type="range"
          min="0"
          max="40"
          step="0.1"
          :value="percent(modelValue.inner_deadzone_q15)"
          @input="setDeadzone('inner_deadzone_q15', $event.target.value)"
        >
      </label>
      <label>
        <span>Outer deadzone {{ percent(modelValue.outer_deadzone_q15) }}%</span>
        <input
          type="range"
          min="0"
          max="40"
          step="0.1"
          :value="percent(modelValue.outer_deadzone_q15)"
          @input="setDeadzone('outer_deadzone_q15', $event.target.value)"
        >
      </label>
    </div>
    <div class="curve-chart-shell">
      <svg
        ref="chart"
        class="curve-chart"
        viewBox="0 0 440 250"
        role="img"
        :aria-label="`${label} input to output response curve`"
        @pointermove="dragPoint"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
      >
        <g class="curve-grid">
          <line
            v-for="tick in chartTicks"
            :key="`horizontal-${tick}`"
            :x1="chartBounds.left"
            :y1="chartY(tick)"
            :x2="chartBounds.right"
            :y2="chartY(tick)"
          />
          <line
            v-for="index in 9"
            :key="`vertical-${index}`"
            :x1="chartX(index - 1)"
            :y1="chartBounds.top"
            :x2="chartX(index - 1)"
            :y2="chartBounds.bottom"
          />
        </g>
        <line
          :x1="chartBounds.left"
          :y1="chartBounds.bottom"
          :x2="chartBounds.right"
          :y2="chartBounds.top"
          class="curve-reference"
        />
        <polyline v-if="baselinePolyline" :points="baselinePolyline" class="curve-baseline" />
        <polyline :points="chartPolyline" class="curve-line" />
        <g
          v-for="point in chartPoints"
          :key="point.index"
          class="curve-node"
          :class="{ locked: point.index === 0 || point.index === 8 }"
        >
          <circle
            :cx="point.x"
            :cy="point.y"
            r="7"
            :tabindex="point.index === 0 || point.index === 8 ? -1 : 0"
            role="slider"
            :aria-label="`Input ${point.index}/8 output ${point.percent}%`"
            :aria-valuenow="point.percent"
            aria-valuemin="0"
            aria-valuemax="100"
            @pointerdown="startDrag(point.index, $event)"
            @keydown.up.prevent="nudgePoint(point.index, 1)"
            @keydown.right.prevent="nudgePoint(point.index, 1)"
            @keydown.down.prevent="nudgePoint(point.index, -1)"
            @keydown.left.prevent="nudgePoint(point.index, -1)"
          />
        </g>
        <text
          x="14"
          y="130"
          class="curve-axis-label"
          transform="rotate(-90 14 130)"
        >Output</text>
        <text x="389" y="242" class="curve-axis-label">Input</text>
        <text x="25" :y="chartBounds.top + 4" class="curve-tick-label">100%</text>
        <text x="36" :y="chartBounds.bottom + 4" class="curve-tick-label">0%</text>
      </svg>
      <p class="curve-chart-hint">Drag the seven inner points, or enter exact values below.</p>
      <div class="curve-points">
        <label v-for="(point, index) in modelValue.curve.output_q15" :key="index">
          <span>{{ index }}/8</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            :disabled="index === 0 || index === 8"
            :value="percent(point)"
            @change="setPoint(index, $event.target.value)"
          >
        </label>
      </div>
    </div>
    <p v-if="!valid" class="inline-error">
      Curve nodes must be monotonic, start at 0%, end at 100%, and deadzones must leave a usable range.
    </p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { Q15_ONE } from "./protocol.js";
import { CURVE_PRESETS, curvePresetToQ15, validateResponse } from "./calibration.js";

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: Object, required: true },
  baselineValue: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue"]);
const chart = ref(null);
const dragIndex = ref(null);
const dragPointerId = ref(null);
const chartBounds = {
  left: 54,
  right: 420,
  top: 20,
  bottom: 220,
};
const chartTicks = [0, 0.25, 0.5, 0.75, 1];

function chartX(index) {
  return chartBounds.left
    + index / 8 * (chartBounds.right - chartBounds.left);
}

function chartY(value) {
  return chartBounds.bottom
    - value * (chartBounds.bottom - chartBounds.top);
}

const chartPoints = computed(() => props.modelValue.curve.output_q15.map(
  (value, index) => ({
    index,
    x: chartX(index),
    y: chartY(value / Q15_ONE),
    percent: percent(value),
  }),
));
const chartPolyline = computed(() => chartPoints.value
  .map((point) => `${point.x},${point.y}`)
  .join(" "));
const baselinePolyline = computed(() => props.baselineValue?.curve?.output_q15
  ?.map((value, index) => `${chartX(index)},${chartY(value / Q15_ONE)}`)
  .join(" ") || "");

const preset = computed(() => {
  const points = props.modelValue.curve.output_q15;
  for (const [name, values] of Object.entries(CURVE_PRESETS)) {
    const encoded = values.map((value) => Math.round(value * Q15_ONE));
    if (encoded.every((value, index) => Math.abs(value - points[index]) <= 1)) {
      return name;
    }
  }
  return "custom";
});

const valid = computed(() => {
  return validateResponse(props.modelValue);
});

function cloneResponse() {
  return {
    ...props.modelValue,
    curve: {
      ...props.modelValue.curve,
      output_q15: [...props.modelValue.curve.output_q15],
    },
  };
}

function percent(value) {
  return Math.round((value / Q15_ONE) * 1000) / 10;
}

function setDeadzone(field, value) {
  const next = cloneResponse();
  next[field] = Math.round(Math.max(0, Math.min(100, Number(value))) / 100 * Q15_ONE);
  emit("update:modelValue", next);
}

function setPoint(index, value) {
  const next = cloneResponse();
  next.curve.output_q15[index] = Math.round(
    Math.max(0, Math.min(100, Number(value))) / 100 * Q15_ONE,
  );
  emit("update:modelValue", next);
}

function setPointRatio(index, ratio) {
  if (index <= 0 || index >= 8) {
    return;
  }
  const points = props.modelValue.curve.output_q15;
  const lower = points[index - 1] / Q15_ONE;
  const upper = points[index + 1] / Q15_ONE;
  const next = cloneResponse();
  next.curve.output_q15[index] = Math.round(
    Math.max(lower, Math.min(upper, ratio)) * Q15_ONE,
  );
  emit("update:modelValue", next);
}

function startDrag(index, event) {
  if (index <= 0 || index >= 8) {
    return;
  }
  dragIndex.value = index;
  dragPointerId.value = event.pointerId;
  chart.value?.setPointerCapture?.(event.pointerId);
  dragPoint(event);
}

function dragPoint(event) {
  if (dragIndex.value === null || !chart.value) {
    return;
  }
  const rect = chart.value.getBoundingClientRect();
  const viewY = (event.clientY - rect.top) / rect.height * 250;
  const ratio = (chartBounds.bottom - viewY)
    / (chartBounds.bottom - chartBounds.top);
  setPointRatio(dragIndex.value, Math.max(0, Math.min(1, ratio)));
}

function stopDrag() {
  if (dragPointerId.value !== null) {
    chart.value?.releasePointerCapture?.(dragPointerId.value);
  }
  dragIndex.value = null;
  dragPointerId.value = null;
}

function nudgePoint(index, direction) {
  if (index <= 0 || index >= 8) {
    return;
  }
  const current = props.modelValue.curve.output_q15[index] / Q15_ONE;
  setPointRatio(index, current + direction * 0.01);
}

function applyPreset(name) {
  if (name === "custom") {
    return;
  }
  const next = cloneResponse();
  next.curve = curvePresetToQ15(name);
  emit("update:modelValue", next);
}
</script>

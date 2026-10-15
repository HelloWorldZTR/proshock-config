<template>
  <section class="curve-editor" :class="{ 'has-anti-config': antiConfig }">
    <div class="response-head">
      <div class="help-label"><strong>{{ label }}</strong><HelpTip v-if="showHelp" id="R10" /></div>
      <select :value="preset" @change="applyPreset($event.target.value)">
        <option value="linear">Linear</option>
        <option value="centerPrecise">Center Precise</option>
        <option value="centerAggressive">Center Aggressive</option>
        <option value="earlyFull">Early Full</option>
        <option value="custom">Custom</option>
      </select>
    </div>
    <div class="deadzone-grid">
      <div class="deadzone-setting">
        <div class="help-label"><span>Inner deadzone {{ percent(modelValue.inner_deadzone_q15) }}%</span><HelpTip v-if="showHelp" id="R08" /></div>
        <input
          type="range"
          :aria-label="`${label} inner deadzone`"
          min="0"
          max="40"
          step="0.1"
          :value="percent(modelValue.inner_deadzone_q15)"
          @input="setDeadzone('inner_deadzone_q15', $event.target.value)"
        >
        <template v-if="antiConfig">
          <label class="anti-toggle"><input type="checkbox" role="switch" :checked="!!antiConfig.anti_deadzone_enabled" :disabled="!antiSupported" @change="setAntiEnabled($event.target.checked)"><span class="anti-track" aria-hidden="true"></span><span>Anti-deadzone</span></label>
          <p v-if="!antiSupported" class="curve-chart-hint">Update firmware to use anti-deadzone.</p>
          <label v-if="antiConfig.anti_deadzone_enabled" class="anti-gain">Gain {{ geometry.gain.toFixed(1) }}×
            <input type="range" min="1" max="5" step="0.1" :value="geometry.gain" :disabled="!antiSupported || !geometry.inner" :aria-label="`${label} anti-deadzone gain`" @input="setGain(Number($event.target.value) * 10)">
          </label>
          <p v-if="antiConfig.anti_deadzone_enabled && !geometry.inner" class="curve-chart-hint">Anti-deadzone is ignored when inner deadzone is 0%.</p>
        </template>
      </div>
      <div class="deadzone-setting">
        <div class="help-label"><span>Outer deadzone {{ percent(modelValue.outer_deadzone_q15) }}%</span><HelpTip v-if="showHelp" id="R09" /></div>
        <input
          type="range"
          :aria-label="`${label} outer deadzone`"
          min="0"
          max="40"
          step="0.1"
          :value="percent(modelValue.outer_deadzone_q15)"
          @input="setDeadzone('outer_deadzone_q15', $event.target.value)"
        >
      </div>
    </div>
    <div class="curve-chart-shell">
      <svg
        ref="chart"
        class="curve-chart"
        viewBox="0 0 440 250"
        role="group"
        :aria-label="`${label} input to output response curve`"
        @pointermove="dragPoint"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
      >
        <rect :x="chartBounds.left" :y="chartBounds.top" :width="geometry.inner * 366" height="200" :fill="geometry.active ? '#f59e0b' : '#808890'" fill-opacity="0.2" />
        <rect :x="chartX(geometry.outer)" :y="chartBounds.top" :width="(1 - geometry.outer) * 366" height="200" fill="#808890" fill-opacity="0.2" />
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
            :x1="chartX((index - 1) / 8)"
            :y1="chartBounds.top"
            :x2="chartX((index - 1) / 8)"
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
          :class="{ locked: pointLocked(point.index) }"
        >
          <circle
            :cx="point.x"
            :cy="point.y"
            r="7"
            :tabindex="pointLocked(point.index) ? -1 : 0"
            role="slider"
            :aria-label="`Input ${point.inputPercent}% output ${point.percent}%`"
            :aria-disabled="pointLocked(point.index)"
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
        <text v-for="tick in chartTicks" :key="tick" :x="chartX(tick)" y="236" text-anchor="middle" class="curve-tick-label">{{ tick * 100 }}%</text>
        <text x="237" y="249" text-anchor="middle" class="curve-axis-label">Input</text>
        <text x="25" :y="chartBounds.top + 4" class="curve-tick-label">100%</text>
        <text x="36" :y="chartBounds.bottom + 4" class="curve-tick-label">0%</text>
      </svg>
      <p class="curve-chart-hint">Drag curve points or enter output values below. The first point controls anti-deadzone gain when enabled.</p>
      <div class="curve-points">
        <label v-for="(point, index) in chartPoints" :key="index">
          <span>{{ point.inputPercent }}%</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            :disabled="pointLocked(index)"
            :value="point.percent"
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
import { responseGeometry, gainFromBoundary } from "./response-plot.js";
import HelpTip from "./components/HelpTip.vue";

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: Object, required: true },
  baselineValue: { type: Object, default: null },
  antiConfig: { type: Object, default: null },
  baselineAntiConfig: { type: Object, default: null },
  antiSupported: { type: Boolean, default: true },
  showHelp: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "update:antiConfig"]);
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
    + index * (chartBounds.right - chartBounds.left);
}

function chartY(value) {
  return chartBounds.bottom
    - value * (chartBounds.bottom - chartBounds.top);
}

const geometry = computed(() => responseGeometry(props.modelValue, props.antiConfig));
const chartPoints = computed(() => geometry.value.nodes.map((point) => ({
  ...point, x: chartX(point.input), y: chartY(point.output),
  inputPercent: Math.round(point.input * 1000) / 10,
  percent: Math.round(point.output * 1000) / 10,
})));
/** @brief Map physical input/output coordinates into the SVG viewport. */
function polyline(geometry) {
  return geometry.line.map((point) => `${chartX(point.input)},${chartY(point.output)}`).join(" ");
}
const chartPolyline = computed(() => polyline(geometry.value));
const baselinePolyline = computed(() => props.baselineValue
  ? polyline(responseGeometry(props.baselineValue, props.baselineAntiConfig)) : "");

/** @brief Lock endpoints and saturated nodes that cannot change output. */
function pointLocked(index) {
  return index === 8 || (index === 0
    ? !geometry.value.active || !props.antiSupported
    : geometry.value.boundary >= 1);
}
/** @brief Stage the per-stick toggle without applying or saving. */
function setAntiEnabled(enabled) {
  if (!props.antiSupported) return;
  emit("update:antiConfig", { ...props.antiConfig, anti_deadzone_enabled: Number(enabled) });
}
/** @brief Stage a bounded gain in tenths while preserving filter fields. */
function setGain(tenths) {
  if (!props.antiSupported || !Number.isFinite(tenths)) return;
  emit("update:antiConfig", { ...props.antiConfig,
    anti_deadzone_gain_tenths: Math.max(10, Math.min(50, Math.round(tenths))) });
}

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
  setPointRatio(index, Number(value) / 100);
}

function setPointRatio(index, ratio) {
  if (pointLocked(index)) {
    return;
  }
  if (!Number.isFinite(ratio)) return;
  if (index === 0) {
    setGain(gainFromBoundary(geometry.value.inner, ratio));
    return;
  }
  ratio = (ratio - geometry.value.boundary) / (1 - geometry.value.boundary);
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
  if (pointLocked(index)) {
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
  if (pointLocked(index)) {
    return;
  }
  const current = geometry.value.nodes[index].output;
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

<style scoped>
.deadzone-grid { align-items: start; }
.deadzone-setting { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.has-anti-config .deadzone-grid { min-height: 170px; }
.anti-toggle { position: relative; display: flex; flex-direction: row; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
.anti-toggle input { position: absolute; opacity: 0; width: 32px; height: 18px; min-height: 0; margin: 0; }
.anti-track { display: inline-block; flex: 0 0 32px; height: 18px; border-radius: 12px; background: #515b65; }
.anti-track::after { content: ''; display: block; width: 14px; height: 14px; margin: 2px; border-radius: 50%; background: white; transition: transform .15s; }
.anti-toggle input:checked + .anti-track { background: #d98613; }
.anti-toggle input:checked + .anti-track::after { transform: translateX(14px); }
.anti-toggle input:focus-visible + .anti-track { outline: 2px solid #5bd3ff; outline-offset: 3px; }
.anti-toggle:has(input:disabled) { opacity: .5; cursor: default; }
.anti-gain { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.curve-points input { appearance: textfield; -moz-appearance: textfield; padding: 0 2px; }
.curve-points input::-webkit-inner-spin-button,
.curve-points input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>

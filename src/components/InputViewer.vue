<template>
  <section class="input-viewer" :class="`input-viewer--${mode}`">
    <header class="section-heading">
      <div>
        <p class="eyebrow">{{ viewMode === "processed" ? sourceLabel : "Raw ADC input" }}</p>
        <h2>{{ title }}</h2>
      </div>
      <div class="sample-meta">
        <button type="button" :class="{ active: viewMode === 'processed' }" @click="viewMode = 'processed'">Processed</button>
        <button type="button" :class="{ active: viewMode === 'raw' }" @click="viewMode = 'raw'">Raw</button>
        <span>{{ viewerHz }} Hz viewer</span>
        <span>Seq {{ activeSequence }}</span>
      </div>
    </header>
    <ControllerVisual
      :stick-values="stickValues"
      :trigger-values="triggerValues"
      :buttons="raw?.buttons || 0"
      :dpad-hat="raw?.dpad_hat ?? 8"
      :show-stick-readouts="!detailKind"
    />
    <div class="activity-strip" aria-label="Button activity">
      <span
        v-for="button in buttons"
        :key="button.bit"
        :class="{ active: isPressed(button.bit) || recentButtons.has(button.bit) }"
      >{{ button.label }}</span>
      <span :class="{ active: (raw?.dpad_hat ?? 8) !== 8 }">D-pad</span>
    </div>
    <InputResponseDetails
      v-if="detailKind"
      :key="`${detailKind}-${viewMode}`"
      :kind="detailKind"
      :stick-values="stickValues"
      :trigger-values="triggerValues"
      :source-label="viewMode === 'processed' ? 'Processed output' : 'Raw normalized input'"
    />
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import ControllerVisual from "../ControllerVisual.vue";
import { normalizeAxis, normalizedTrigger } from "../calibration.js";
import { Q15_ONE } from "../protocol.js";
import InputResponseDetails from "./InputResponseDetails.vue";

const props = defineProps({
  mode: { type: String, default: "large" },
  title: { type: String, default: "Live input" },
  raw: { type: Object, default: null },
  snapshot: { type: Object, default: null },
  calibration: { type: Object, required: true },
  viewerHz: { type: Number, default: 20 },
  sourceLabel: { type: String, default: "Processed input" },
  detailKind: { type: String, default: "" },
});

const buttons = [
  "Square", "Cross", "Circle", "Triangle", "L1", "R1", "L2", "R2",
  "Create", "Options", "L3", "R3", "PS", "Touchpad",
].map((label, bit) => ({ label, bit }));
const viewMode = ref("processed");
const recentButtons = ref(new Set());
let activityTimer = null;

const rawStickValues = computed(() => {
  const adc = props.raw?.adc;
  if (!adc || adc.length < 4) return [0, 0, 0, 0];
  return adc.slice(0, 4).map((value, index) => (
    normalizeAxis(value, props.calibration.axis[index], index)
  ));
});
const rawTriggerValues = computed(() => {
  const adc = props.raw?.adc;
  if (!adc || adc.length < 6) return [0, 0];
  return props.calibration.trigger.map((trigger, index) => (
    normalizedTrigger(adc[4 + index], trigger)
  ));
});
const processedStickValues = computed(() => {
  const values = props.snapshot?.output_stick_q15;
  if (!values || values.length < 4) return [0, 0, 0, 0];
  return values.map((value) => Math.max(-1, Math.min(1, value / Q15_ONE)));
});
const processedTriggerValues = computed(() => {
  const values = props.snapshot?.output_trigger_q15;
  if (!values || values.length < 2) return [0, 0];
  return values.map((value) => Math.max(0, Math.min(1, value / Q15_ONE)));
});
const stickValues = computed(() => (
  viewMode.value === "processed" ? processedStickValues.value : rawStickValues.value
));
const triggerValues = computed(() => (
  viewMode.value === "processed" ? processedTriggerValues.value : rawTriggerValues.value
));
const activeSequence = computed(() => (
  viewMode.value === "processed"
    ? props.snapshot?.sequence ?? "—"
    : props.raw?.sequence ?? props.snapshot?.sequence ?? "—"
));

function isPressed(bit) {
  return ((props.raw?.buttons || 0) & (1 << bit)) !== 0;
}

watch(() => props.raw?.buttons, (next = 0, previous = 0) => {
  const pressed = [];
  buttons.forEach(({ bit }) => {
    if ((next & (1 << bit)) && !(previous & (1 << bit))) pressed.push(bit);
  });
  if (!pressed.length) return;
  recentButtons.value = new Set([...recentButtons.value, ...pressed]);
  window.clearTimeout(activityTimer);
  activityTimer = window.setTimeout(() => { recentButtons.value = new Set(); }, 300);
});

onUnmounted(() => window.clearTimeout(activityTimer));
</script>

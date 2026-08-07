<template>
  <section class="axis-panel">
    <header class="section-heading">
      <div>
        <p class="eyebrow">Analog pipeline</p>
        <h2>Axis / Trigger</h2>
      </div>
      <button type="button" class="text-button" @click="expanded = !expanded">
        {{ expanded ? "Processed only" : "Show pipeline" }}
      </button>
    </header>
    <div class="axis-table" :class="{ expanded }">
      <div class="axis-row axis-header">
        <span>Input</span>
        <span>Raw ADC</span>
        <span v-if="expanded">Calibrated</span>
        <span>{{ expanded ? "Q15 output" : "Final HID" }}</span>
      </div>
      <div v-for="(name, index) in names" :key="name" class="axis-row">
        <strong>{{ name }}</strong>
        <span>{{ rawValues[index] }}</span>
        <span v-if="expanded">{{ calibrated(index) }}</span>
        <span class="axis-output">{{ expanded ? output(index) : hidOutput(index) }}</span>
        <i class="axis-meter"><b :style="{ width: `${meter(index)}%` }"></b></i>
      </div>
    </div>
    <StickRoundnessPreview :stick-values="stickValues" />
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import StickRoundnessPreview from "./StickRoundnessPreview.vue";

const props = defineProps({
  raw: { type: Object, default: null },
  snapshot: { type: Object, default: null },
});
const expanded = ref(false);
const names = ["LX", "LY", "RX", "RY", "L2", "R2"];
/* Keep every expanded pipeline column on the firmware snapshot sequence. */
const rawValues = computed(() => props.snapshot?.raw_adc || props.raw?.adc || Array(6).fill(0));

function q15(index, field) {
  if (!props.snapshot) return null;
  return index < 4
    ? props.snapshot[`${field}_stick_q15`]?.[index]
    : props.snapshot[`${field}_trigger_q15`]?.[index - 4];
}
function formatted(index, value) {
  if (value == null) return "—";
  return index < 4 ? (value / 32767).toFixed(3) : `${Math.round(value / 32767 * 100)}%`;
}
function calibrated(index) { return formatted(index, q15(index, "calibrated")); }
function output(index) { return formatted(index, q15(index, "output")); }
function hidValue(index) {
  return props.snapshot?.hid?.[index] ?? null;
}
function hidOutput(index) {
  const value = hidValue(index);
  if (value == null) return "—";
  if (index >= 4) return `${Math.round(value / 255 * 100)}% · ${value}`;
  const normalized = value < 128 ? (value - 128) / 128 : (value - 128) / 127;
  return `${normalized.toFixed(3)} · ${value}`;
}
function meter(index) {
  const value = hidValue(index);
  if (value == null) return 0;
  return index < 4 ? Math.abs(value - 128) / 128 * 100 : value / 255 * 100;
}
const stickValues = computed(() => [0, 1, 2, 3].map((index) => {
  const value = hidValue(index);
  if (value == null) return 0;
  return (value - 128) / (value < 128 ? 128 : 127);
}));
</script>

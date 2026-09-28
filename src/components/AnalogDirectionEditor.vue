<template>
  <section class="analog-directions">
    <header><h2>Hardware directions</h2><p>Preview uses raw ADC and draft directions. Apply before calibration.</p></header>
    <p v-if="!supported" class="support-note">Update firmware to support configurable analog directions.</p>
    <div class="editor-split direction-split">
      <div class="direction-fields">
        <label v-for="channel in [0, 1, 2, 3]" :key="channel" class="system-pollrate direction-row">
          <span>{{ labels[channel] }} <small>ADC {{ raw?.adc?.[channel] ?? '—' }}</small></span>
          <select :aria-label="`${labels[channel]} ADC direction`" :value="inverted(channel) ? 'decreases' : 'increases'" :disabled="!supported || disabled" @change="$emit('direction', { channel, inverted: $event.target.value === 'decreases' })">
            <option value="increases">{{ channel % 2 ? 'Down increases ADC' : 'Right increases ADC' }}</option>
            <option value="decreases">{{ channel % 2 ? 'Down decreases ADC' : 'Right decreases ADC' }}</option>
          </select>
        </label>
      </div>
      <div class="direction-viewer" aria-label="Stick direction preview">
        <StickRoundnessPreview :stick-values="stickValues" :live-available="hasStickData" position-only />
      </div>
    </div>
    <div class="editor-split direction-split direction-triggers">
      <div class="direction-fields">
        <label v-for="channel in [4, 5]" :key="channel" class="system-pollrate direction-row">
          <span>{{ labels[channel] }} <small>ADC {{ raw?.adc?.[channel] ?? '—' }}</small></span>
          <select :aria-label="`${labels[channel]} ADC direction`" :value="inverted(channel) ? 'decreases' : 'increases'" :disabled="!supported || disabled" @change="$emit('direction', { channel, inverted: $event.target.value === 'decreases' })">
            <option value="increases">Press increases ADC</option><option value="decreases">Press decreases ADC</option>
          </select>
        </label>
      </div>
      <div class="direction-trigger-preview" aria-label="Trigger direction preview">
        <div v-for="trigger in triggerPoints" :key="trigger.label" class="direction-trigger-meter">
          <div><strong>{{ trigger.label }}</strong><span>{{ trigger.percent == null ? '—' : `${trigger.percent}%` }}</span></div>
          <span class="response-trigger-meter" role="progressbar" :aria-label="`${trigger.label} draft preview`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="trigger.percent ?? undefined"><i :style="{ width: `${trigger.percent ?? 0}%` }"></i></span>
        </div>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed } from "vue";
import { normalizeAxis, normalizedTrigger } from "../calibration.js";
import { analogAxisInvert } from "../analog-direction.js";
import StickRoundnessPreview from "./StickRoundnessPreview.vue";

const props = defineProps({ calibration: Object, raw: Object, legacyAxisInvert: Array, disabled: Boolean });
defineEmits(["direction"]);
const supported = computed(() => props.calibration?.calibration_version === 2);
const axes = computed(() => analogAxisInvert(props.calibration, props.legacyAxisInvert));
const labels = ["LX", "LY", "RX", "RY", "L2", "R2"];
const stickValues = computed(() => [0, 1, 2, 3].map(preview));
const hasStickData = computed(() => stickValues.value.every(Number.isFinite));
const triggerPoints = computed(() => [4, 5].map(channel => {
  const value = preview(channel);
  return { label: labels[channel], percent: Number.isFinite(value) ? Math.round(value * 100) : null };
}));

/** @brief Read draft polarity while keeping legacy firmware controls read-only. */
function inverted(channel) { return supported.value ? !!(props.calibration.direction_mask & (1 << channel)) : !!axes.value?.[channel]; }

/** @brief Normalize untouched raw ADC once; ignore filtered Profile and HID output. */
function preview(channel) {
  const value = props.raw?.adc?.[channel];
  if (!Number.isFinite(value)) return null;
  return channel < 4 ? normalizeAxis(value, props.calibration.axis[channel], channel, axes.value) : normalizedTrigger(value, props.calibration.trigger[channel - 4]);
}
</script>
<style scoped>
.analog-directions { display: grid; gap: 12px; }
.analog-directions h2 { margin: 0 0 8px; font-size: 16px; }
.analog-directions p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.direction-split { align-items: center; }
.direction-row { grid-template-columns: var(--system-label-width, 240px) minmax(0, 1fr); }
.direction-row > span { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.direction-row small { color: var(--muted); font: 10px var(--font-mono); white-space: nowrap; }
.direction-viewer :deep(.roundness-preview) { margin-top: 0; }
.direction-triggers { padding-top: 12px; border-top: 1px solid var(--border); }
.direction-trigger-preview { display: grid; gap: 0; }
.direction-trigger-meter { display: grid; align-content: center; gap: 8px; min-height: 62px; }
.direction-trigger-meter > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 11px; }
.direction-trigger-meter > div span { color: var(--accent); font: 12px var(--font-mono); }
@media (max-width: 600px) { .direction-row { grid-template-columns: 1fr; row-gap: 8px; } .direction-row select { width: 100%; } }
</style>

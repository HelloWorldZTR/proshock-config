<template>
  <section class="analog-directions">
    <header><div class="help-label"><h2>Hardware directions</h2><HelpTip id="R07" /></div><p>Move right/down, press triggers. If the preview is reversed, turn on Invert.</p></header>
    <p v-if="!supported" class="support-note">Update firmware to support configurable analog directions.</p>
    <div class="editor-split direction-split">
      <div class="direction-fields">
        <label v-for="channel in [0, 1, 2, 3]" :key="channel" class="system-pollrate direction-row">
          <span>{{ labels[channel] }} <small>ADC {{ raw?.adc?.[channel] ?? '—' }}</small></span>
          <span class="rc-stage-switch direction-switch">
            <input type="checkbox" role="switch" :aria-label="`${labels[channel]} invert`" :checked="inverted(channel)" :disabled="!supported || disabled" @change="$emit('direction', { channel, inverted: $event.target.checked })">
            <span class="rc-switch-track" aria-hidden="true"></span><span>Invert</span>
          </span>
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
          <span class="rc-stage-switch direction-switch">
            <input type="checkbox" role="switch" :aria-label="`${labels[channel]} invert`" :checked="inverted(channel)" :disabled="!supported || disabled" @change="$emit('direction', { channel, inverted: $event.target.checked })">
            <span class="rc-switch-track" aria-hidden="true"></span><span>Invert</span>
          </span>
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
import HelpTip from "./HelpTip.vue";

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
.direction-row > span:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.direction-row > .direction-switch { align-items: center; justify-content: flex-start; min-height: 38px; padding-top: 0; gap: 9px; }
.direction-switch:has(input:disabled) { opacity: .5; cursor: default; }
.direction-row small { color: var(--muted); font: 10px var(--font-mono); white-space: nowrap; }
.direction-viewer :deep(.roundness-preview) { margin-top: 0; }
.direction-triggers { padding-top: 12px; border-top: 1px solid var(--border); }
.direction-trigger-preview { display: grid; gap: 0; }
.direction-trigger-meter { display: grid; align-content: center; gap: 8px; min-height: 62px; }
.direction-trigger-meter > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 11px; }
.direction-trigger-meter > div span { color: var(--accent); font: 12px var(--font-mono); }
@media (max-width: 600px) { .direction-row { grid-template-columns: 1fr; row-gap: 8px; } }
</style>

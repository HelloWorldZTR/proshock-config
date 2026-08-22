<template>
  <label class="rc-control-row">
    <span>
      <strong>{{ label }}</strong>
      <small>{{ roundedHz }} Hz · α {{ normalizedAlpha }}</small>
    </span>
    <input
      type="range"
      :min="boundedMinimum"
      :max="boundedMaximum"
      step="1"
      :value="roundedHz"
      @input="$emit('update', Number($event.target.value))"
    >
    <input
      class="rc-number-input"
      type="number"
      :min="boundedMinimum"
      :max="boundedMaximum"
      step="1"
      :value="roundedHz"
      @change="$emit('update', Number($event.target.value))"
    >
  </label>
</template>

<script setup>
import { computed } from "vue";
import {
  RC_MAX_CUTOFF_HZ,
  RC_MIN_CUTOFF_HZ,
  alphaQ15ToCutoffHz,
} from "../rc-filter.js";

const props = defineProps({
  label: { type: String, required: true },
  alphaQ15: { type: Number, required: true },
  minimumHz: { type: Number, default: RC_MIN_CUTOFF_HZ },
  maximumHz: { type: Number, default: RC_MAX_CUTOFF_HZ },
});
defineEmits(["update"]);

const boundedMinimum = computed(() => Math.max(RC_MIN_CUTOFF_HZ, Math.round(props.minimumHz)));
const boundedMaximum = computed(() => Math.min(RC_MAX_CUTOFF_HZ, Math.round(props.maximumHz)));
const roundedHz = computed(() => Math.max(
  boundedMinimum.value,
  Math.min(boundedMaximum.value, Math.round(alphaQ15ToCutoffHz(props.alphaQ15))),
));
const normalizedAlpha = computed(() => (props.alphaQ15 / 32768).toFixed(5));
</script>

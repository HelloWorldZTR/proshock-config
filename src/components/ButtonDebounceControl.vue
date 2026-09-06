<template>
  <div class="debounce-control">
    <div class="setting-label"><strong>Button debounce</strong><small>All digital buttons in the current Profile</small></div>
    <div class="debounce-inputs">
      <div class="debounce-slider">
        <input type="range" min="1" max="32" step="1" :value="samples" aria-label="Button debounce duration" @input="setSamples(Number($event.target.value))">
        <div><span>0.125 ms</span><span>4 ms</span></div>
      </div>
      <label class="debounce-number">
        <span class="visually-hidden">Button debounce in milliseconds</span>
        <input ref="numberInput" type="number" min="0.125" max="4" step="0.125" :value="milliseconds" @input="setMilliseconds">
        <span>ms</span>
      </label>
      <button type="button" @click="setSamples(8)">Restore default</button>
    </div>
    <p v-if="error" role="alert" class="field-error">{{ error }}</p>
  </div>
</template>
<script setup>
import { computed, onUnmounted, ref } from "vue";
import { normalizeButtonDebounceSamples } from "../protocol.js";
const props = defineProps({ modelValue: Number });
const emit = defineEmits(["update:modelValue", "validity"]);
const error = ref("");
const numberInput = ref(null);
const samples = computed(() => normalizeButtonDebounceSamples(props.modelValue));
const milliseconds = computed(() => samples.value / 8);
/** Validate milliseconds before encoding the unchanged sample-count field. */
function setMilliseconds(event) {
  const value = event.target.valueAsNumber;
  const valid = Number.isFinite(value) && value >= 0.125 && value <= 4 && Number.isInteger(value * 8);
  error.value = valid ? "" : "Use 0.125–4 ms in steps of 0.125 ms.";
  emit("validity", valid);
  if (valid) emit("update:modelValue", value * 8);
}
function setSamples(value) {
  error.value = "";
  if (numberInput.value) numberInput.value.value = value / 8;
  emit("validity", true);
  emit("update:modelValue", value);
}
onUnmounted(() => emit("validity", true));
</script>

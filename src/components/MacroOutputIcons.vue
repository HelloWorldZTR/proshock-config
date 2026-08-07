<template>
  <div class="macro-output-icons" :class="{ compact }" :aria-label="summary" data-i18n-ignore>
    <span v-if="!outputs.length" class="macro-pause">Pause</span>
    <span v-for="output in outputs" :key="output.id" class="macro-output-icon" :title="output.label">
      <img :src="output.icon" :alt="output.label">
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { SOURCE_NAMES } from "../resolver-schema.js";

const props = defineProps({ mask: { type: Number, default: 0 }, compact: Boolean });
const iconFiles = [
  "PlayStation_button_S.svg", "PlayStation_button_X.svg", "PlayStation_button_C.svg", "PlayStation_button_T.svg",
  "PlayStation_4_button_L1.svg", "PlayStation_4_button_R1.svg", "PlayStation_4_button_L2.svg", "PlayStation_4_button_R2.svg",
  "PlayStation_4_Share_button.svg", "PlayStation_4_Options_button.svg", "PlayStation_button_L3.svg", "PlayStation_button_R3.svg",
  "PlayStation_button_Home.svg", "PlayStation_4_Touch_Pad_Clicking_button.svg", "PlayStation_Up_button.svg",
  "PlayStation_Right_button.svg", "PlayStation_Down_button.svg", "PlayStation_Left_button.svg",
];
const icons = iconFiles.map((file) => new URL(`../assets/${file}`, import.meta.url).href);
const outputs = computed(() => SOURCE_NAMES.slice(0, 18).flatMap((label, id) => (
  props.mask & (1 << id) ? [{ id, label, icon: icons[id] }] : []
)));
const summary = computed(() => outputs.value.map((output) => output.label).join(" + ") || "Pause");
</script>

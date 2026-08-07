<template>
  <section class="response-detail" :aria-label="`${sourceLabel} ${kind} detail`">
    <header>
      <span>{{ kind === "sticks" ? "Stick position detail" : "Trigger pressure detail" }}</span>
      <small>{{ sourceLabel }}</small>
    </header>

    <StickRoundnessPreview v-if="kind === 'sticks'" :stick-values="stickValues" />

    <div v-else class="response-trigger-grid">
      <article v-for="trigger in triggerPoints" :key="trigger.label" class="response-trigger">
        <div>
          <strong>{{ trigger.label }}</strong>
          <b>{{ trigger.percent }}%</b>
        </div>
        <span class="response-trigger-meter">
          <i :style="{ width: `${trigger.percent}%` }"></i>
        </span>
        <small>Profile output pressure</small>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import StickRoundnessPreview from "./StickRoundnessPreview.vue";

const props = defineProps({
  kind: { type: String, required: true },
  stickValues: { type: Array, required: true },
  triggerValues: { type: Array, required: true },
  sourceLabel: { type: String, required: true },
});

function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : 0;
}

const triggerPoints = computed(() => [0, 1].map((index) => ({
  label: index ? "R2" : "L2",
  percent: Math.round(clamp(props.triggerValues[index], 0, 1) * 100),
})));
</script>

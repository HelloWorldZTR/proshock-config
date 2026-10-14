<template>
  <div class="extra-button-strip" role="group" aria-label="K1–K8">
    <component :is="interactive ? 'button' : 'span'" v-for="source in sources" :key="source"
      :type="interactive ? 'button' : undefined" class="extra-button"
      :data-key-hint="interactive ? hints[source] : undefined"
      :class="{ 'mapping-key-hint': interactive, pressed: pressedSources.has(source), selected: selected === source }"
      :aria-pressed="interactive ? selected === source : undefined"
      :aria-label="`${hints[source] || `K${source - 17}`}${pressedSources.has(source) ? ' · ' + translate('Pressed') : ''}`"
      data-i18n-ignore @click="interactive && emit('select', source)">
      <span>K{{ source - 17 }}</span>
    </component>
  </div>
</template>
<script setup>
import { translate } from "../i18n.js";
defineProps({
  pressedSources: { type: Set, default: () => new Set() },
  interactive: Boolean,
  hints: { type: Object, default: () => ({}) },
  selected: { type: Number, default: null },
});
const emit = defineEmits(["select"]);
const sources = Array.from({ length: 8 }, (_, index) => index + 18);
</script>
<style scoped>
/* Match the compact, flat key indicators beneath the Home controller. */
.extra-button-strip { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; width: 100%; margin: 10px auto 12px; }
.extra-button { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; min-height: 26px; padding: 4px 7px; border: 0; border-bottom: 1px solid var(--border-strong); border-radius: 0; background: transparent; color: var(--muted); font: 10px var(--font-ui); box-shadow: none; transition: color .15s, border-color .15s, background .15s; }
button.extra-button:hover, .extra-button.selected { border-color: var(--accent); color: var(--accent); background: transparent; }
.extra-button.selected { border-bottom-width: 2px; }
.extra-button.pressed, button.extra-button.pressed:hover { border-color: var(--accent); background: var(--accent); color: var(--bg-canvas); box-shadow: 0 2px 0 var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 25%, transparent); }
@media (prefers-reduced-motion: reduce) { .extra-button { transition: none; } }
</style>

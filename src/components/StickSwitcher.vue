<template>
  <div class="stick-switcher" role="group" aria-label="Stick selection">
    <span class="stick-switcher-selection" :class="{ right: modelValue === 1 }" aria-hidden="true"></span>
    <button
      v-for="(label, index) in ['Left stick', 'Right stick']"
      :key="index"
      type="button"
      :aria-pressed="modelValue === index"
      @click="$emit('update:modelValue', index)"
      @keydown.right.prevent="selectWithKeyboard($event, 1)"
      @keydown.left.prevent="selectWithKeyboard($event, 0)"
      @keydown.home.prevent="selectWithKeyboard($event, 0)"
      @keydown.end.prevent="selectWithKeyboard($event, 1)"
    >{{ label }}</button>
  </div>
</template>

<script setup>
defineProps({ modelValue: { type: Number, default: 0 } });
const emit = defineEmits(["update:modelValue"]);

/** @brief Select and focus the same segment when using arrow keys. */
function selectWithKeyboard(event, index) {
  emit("update:modelValue", index);
  event.currentTarget.parentElement.querySelectorAll("button")[index]?.focus();
}
</script>

<style scoped>
.stick-switcher { position: relative; display: inline-grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex-shrink: 0; gap: 0; padding: 3px; border: 1px solid var(--border); border-radius: 9px; background: #0b141c; isolation: isolate; }
.stick-switcher-selection { position: absolute; inset: 3px auto 3px 3px; width: calc((100% - 6px) / 2); border: 1px solid #55d6ff66; border-radius: 6px; background: #142d3b; box-shadow: 0 1px 5px #0003; transition: transform 480ms cubic-bezier(.4, 0, .2, 1); pointer-events: none; z-index: -1; }
.stick-switcher-selection.right { transform: translateX(100%); }
.stick-switcher button { min-width: 112px; min-height: 38px; padding: 8px 16px; border: 0; border-radius: 6px; background: transparent; color: var(--secondary); font-size: 14px; transition: color 320ms ease; }
.stick-switcher button[aria-pressed=true] { color: var(--accent); }
.stick-switcher button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { .stick-switcher-selection, .stick-switcher button { transition: none; } }
</style>

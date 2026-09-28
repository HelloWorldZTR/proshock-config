<template>
  <div class="stick-panel-motion">
    <Transition :name="selectedStick === 1 ? 'stick-forward' : 'stick-back'">
      <slot />
    </Transition>
  </div>
</template>

<script setup>
defineProps({ selectedStick: { type: Number, default: 0 } });
</script>

<style scoped>
.stick-panel-motion { display: grid; min-width: 0; }
.stick-panel-motion > :deep(*) { grid-area: 1 / 1; min-width: 0; }
:deep(.stick-forward-enter-active), :deep(.stick-back-enter-active) { transition: transform 480ms cubic-bezier(.4, 0, .2, 1), opacity 360ms ease; }
:deep(.stick-forward-leave-active), :deep(.stick-back-leave-active) { transition: transform 360ms ease, opacity 280ms ease; pointer-events: none; }
:deep(.stick-forward-enter-from), :deep(.stick-back-leave-to) { transform: translateX(24px); opacity: 0; }
:deep(.stick-back-enter-from), :deep(.stick-forward-leave-to) { transform: translateX(-24px); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  :deep(.stick-forward-enter-active), :deep(.stick-back-enter-active), :deep(.stick-forward-leave-active), :deep(.stick-back-leave-active) { transition: none; }
  :deep(.stick-forward-enter-from), :deep(.stick-back-enter-from), :deep(.stick-forward-leave-to), :deep(.stick-back-leave-to) { transform: none; }
}
</style>

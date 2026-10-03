<template>
  <footer class="configurator-apply-footer" aria-label="Current settings">
    <div class="settings-footer-inner">
      <div class="settings-footer-status" aria-live="polite">
        <span v-if="profile !== undefined">Slot {{ profile + 1 }}</span>
        <span v-else>Device settings</span>
        <strong>{{ stateLabel }}</strong>
        <HelpTip id="R01" />
      </div>
      <div class="settings-footer-actions">
        <slot name="secondary-actions"></slot>
        <button type="button" class="primary" :disabled="state?.disabled" :aria-busy="state?.spinning" @click="performAction"><slot name="primary-content">{{ state?.label || "Apply" }}</slot></button>
      </div>
    </div>
  </footer>
</template>
<script setup>
import HelpTip from "./HelpTip.vue";
const props = defineProps({ state: Object, stateLabel: { type: String, default: "Current settings" }, profile: Number });
const emit = defineEmits(["primary-action"]);
/** @brief Dispatch only the currently available Apply or Save action. */
function performAction() {
  if (props.state?.disabled || !props.state?.action) return;
  emit("primary-action", props.state.action);
}
</script>

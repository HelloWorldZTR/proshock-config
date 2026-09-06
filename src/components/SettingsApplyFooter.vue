<template>
  <footer class="configurator-apply-footer" aria-label="Current settings">
    <div aria-live="polite"><strong>{{ stateLabel }}</strong><span>{{ state?.detail }}</span></div>
    <button type="button" class="primary" :disabled="state?.disabled" @click="$emit('apply')">{{ state?.label || "Apply current settings" }}</button>
  </footer>
</template>
<script setup>
defineProps({ state: Object, stateLabel: { type: String, default: "Current settings" } });
defineEmits(["apply"]);
</script>

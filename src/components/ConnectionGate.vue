<template>
  <div class="connection-gate">
    <section ref="panel" class="connection-gate-panel" role="dialog" aria-modal="true" aria-labelledby="connection-title" tabindex="-1" @keydown="trapFocus">
      <span class="gate-symbol" aria-hidden="true">↗</span>
      <h1 id="connection-title">{{ firmware ? "Connect for firmware recovery" : "Connect your controller" }}</h1>
      <p>{{ firmware ? "Connect an IAP controller to continue. Hold PS + Options while reconnecting power to enter recovery." : "Connect and load your controller settings to use this page." }}</p>
      <p v-if="busy" role="status">Connecting and reading device settings…</p>
      <p v-if="error" class="gate-error" role="alert">{{ error }}</p>
      <div class="gate-actions">
        <button ref="primary" type="button" class="primary" :disabled="busy || blocked" @click="$emit('connect')">{{ firmware ? "Select IAP device" : "Connect controller" }}</button>
        <button type="button" :disabled="busy" @click="$emit('home')">Return Home</button>
      </div>
      <div v-if="conflict" class="gate-conflict">
        <button type="button" @click="$emit('export')">Export Profile</button>
        <button type="button" :disabled="busy" @click="$emit('reload')">Discard local draft and read device</button>
      </div>
      <button v-if="development" type="button" class="text-button gate-dev" :disabled="busy" @click="$emit('dismiss')">Close overlay · Development preview</button>
    </section>
  </div>
</template>
<script setup>
import { onMounted, onUnmounted, ref } from "vue";
defineProps({ firmware: Boolean, busy: Boolean, error: String, development: Boolean, conflict: Boolean, blocked: Boolean });
defineEmits(["connect", "home", "dismiss", "export", "reload"]);
const panel = ref(null);
const primary = ref(null);
let previousFocus;
/** Keep keyboard navigation within the connection gate. */
function trapFocus(event) {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); return; }
  if (event.key !== "Tab") return;
  const items = [...panel.value.querySelectorAll('button:not(:disabled)')];
  if (!items.length) { event.preventDefault(); return; }
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.value)) { event.preventDefault(); first.focus(); }
}
onMounted(() => { previousFocus = document.activeElement; panel.value.focus(); });
onUnmounted(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
</script>

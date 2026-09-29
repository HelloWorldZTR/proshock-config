<template>
  <div class="calibration-safety-scrim">
    <section ref="dialog" class="calibration-safety-dialog" role="dialog" aria-modal="true" aria-labelledby="calibration-safety-title" @keydown="handleKeydown">
      <header>
        <h2 id="calibration-safety-title">Check hardware before calibration</h2>
      </header>
      <p>If you use an HML or other third-party ribbon cable, or a TMR stick from a non-PS4-compatible controller, you may need to set the trigger and stick directions in Config → System.</p>
      <p class="calibration-safety-danger"><strong>Important:</strong> When using a TMR stick from another controller, you must change the power resistor jumper. Otherwise the power supply will short-circuit.</p>
      <label class="calibration-safety-remember"><input v-model="dontShowAgain" type="checkbox"><span>Don't show this again</span></label>
      <footer>
        <button ref="cancelButton" type="button" @click="$emit('cancel')">Cancel</button>
        <button type="button" class="primary" @click="$emit('continue', dontShowAgain)">I understand · Start calibration</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from "vue";

const emit = defineEmits(["cancel", "continue"]);
const dialog = ref(null);
const cancelButton = ref(null);
const dontShowAgain = ref(false);
/** @brief Keep keyboard focus inside the hardware warning until the user decides. */
function handleKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(dialog.value?.querySelectorAll("button, input:not(:disabled)") || []);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(async () => { await nextTick(); cancelButton.value?.focus(); });
</script>

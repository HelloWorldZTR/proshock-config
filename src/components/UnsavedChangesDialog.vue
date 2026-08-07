<template>
  <div class="leave-guard-scrim" @mousedown.self="$emit('stay')">
    <section
      ref="dialog"
      class="leave-guard-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-guard-title"
      @keydown="handleKeydown"
    >
      <header>
        <p class="eyebrow">Unsaved configuration</p>
        <h2 id="leave-guard-title">{{ title }}</h2>
        <p>{{ detail }}</p>
      </header>
      <p v-if="error" class="inline-error">{{ error }}</p>
      <footer>
        <button
          type="button"
          class="danger-outline"
          :disabled="busy || !canDiscard"
          :title="discardReason"
          @click="$emit('discard')"
        >Discard & leave</button>
        <button ref="stayButton" type="button" :disabled="busy" @click="$emit('stay')">
          {{ kind === "calibration" ? "Continue calibration" : "Stay" }}
        </button>
        <button
          v-if="kind === 'draft'"
          type="button"
          class="primary"
          :disabled="busy || !canApply"
          @click="$emit('apply')"
        >{{ busy ? "Working…" : "Apply now" }}</button>
        <button
          v-else-if="kind === 'applied'"
          type="button"
          class="primary"
          :disabled="busy || !canSave"
          @click="$emit('save')"
        >{{ busy ? "Saving…" : "Save & leave" }}</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";

const props = defineProps({
  kind: { type: String, required: true },
  busy: { type: Boolean, default: false },
  canApply: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  canDiscard: { type: Boolean, default: true },
  discardReason: { type: String, default: "" },
  error: { type: String, default: "" },
});
defineEmits(["stay", "apply", "save", "discard"]);

const dialog = ref(null);
const stayButton = ref(null);
const title = computed(() => ({
  draft: "Apply changes before leaving?",
  calibration: "Calibration is still in progress",
  applied: "Save applied changes before leaving?",
}[props.kind] || "Unsaved changes"));
const detail = computed(() => ({
  draft: "The current draft has not reached firmware RAM. Apply it first, stay here, or explicitly discard it.",
  calibration: "The current measurements have not completed the validated Apply and Save sequence.",
  applied: "The configuration is active in firmware RAM but has not been committed to flash.",
}[props.kind] || ""));

function handleKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    stayButton.value?.click();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = Array.from(
    dialog.value?.querySelectorAll("button:not(:disabled)") || [],
  );
  if (!focusable.length) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  await nextTick();
  stayButton.value?.focus();
});
</script>

<template>
  <div class="config-session-warning-scrim">
    <section
      ref="dialog"
      class="config-session-warning-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="config-session-warning-title"
      aria-describedby="config-session-warning-detail"
      @keydown="handleKeydown"
    >
      <header>
        <p class="eyebrow">Configuration session</p>
        <h2 id="config-session-warning-title">Configuration Mode is active</h2>
        <p id="config-session-warning-detail">
          Using the controller in a game while Configuration Mode is active may cause disconnects, detection errors, and a small performance impact. Disconnect from the status bar before testing in a game.
        </p>
      </header>
      <label class="config-session-warning-choice">
        <input v-model="suppressFutureWarnings" type="checkbox">
        <span>Don't show this warning again</span>
      </label>
      <footer>
        <button ref="confirmButton" type="button" class="primary" @click="confirm">
          I understand
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from "vue";

const emit = defineEmits(["acknowledge"]);
const dialog = ref(null);
const confirmButton = ref(null);
const suppressFutureWarnings = ref(false);

function confirm() {
  emit("acknowledge", suppressFutureWarnings.value);
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    confirm();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = Array.from(
    dialog.value?.querySelectorAll("button, input") || [],
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
  confirmButton.value?.focus();
});
</script>

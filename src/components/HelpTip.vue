<template>
  <span class="help-tip" data-i18n-ignore :data-help-id="id" @mouseenter="show" @mouseleave="queueClose">
    <button
      ref="trigger"
      type="button"
      class="help-tip-trigger"
      :aria-label="currentLocale === 'zh-CN' ? `了解${copy.title}的作用` : `Explain ${copy.title}`"
      :aria-expanded="isOpen"
      :aria-describedby="isOpen ? panelId : undefined"
      @focus="show"
      @blur="queueClose"
      @click.prevent.stop="toggle"
    ><span aria-hidden="true">?</span></button>
    <Teleport to="body">
      <div
        v-if="isOpen"
        :id="panelId"
        ref="panel"
        class="help-tip-panel"
        data-i18n-ignore
        role="tooltip"
        :style="panelStyle"
        @mouseenter="cancelClose"
        @mouseleave="queueClose"
      >
        <p>{{ copy.body }}</p>
      </div>
    </Teleport>
  </span>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { currentLocale } from "../i18n.js";
import { helpContent } from "../help-content.js";
import { activeHelpUid } from "../help-state.js";

const props = defineProps({ id: { type: String, required: true } });
const uid = getCurrentInstance().uid;
const panelId = `help-tip-${uid}`;
const trigger = ref(null);
const panel = ref(null);
const pinned = ref(false);
const panelStyle = ref({ left: "12px", top: "12px" });
const copy = computed(() => helpContent(props.id, currentLocale.value) || { title: props.id, body: "" });
const isOpen = computed(() => activeHelpUid.value === uid);
let closeTimer = null;

/** @brief Position the shared popover beside its trigger without clipping the viewport. */
function positionPanel() {
  if (!trigger.value || !panel.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const width = panel.value.offsetWidth;
  const height = panel.value.offsetHeight;
  const left = Math.max(12, Math.min(anchor.left - 14, window.innerWidth - width - 12));
  // Prefer above the control so its input remains available while the tip is open.
  const above = anchor.top - height - 10 >= 76;
  const top = above
    ? anchor.top - height - 10
    : Math.min(window.innerHeight - height - 12, anchor.bottom + 10);
  panelStyle.value = { left: `${left}px`, top: `${top}px` };
}

/** @brief Show the approved explanation for this setting. */
function show() {
  cancelClose();
  activeHelpUid.value = uid;
  nextTick(positionPanel);
}

/** @brief Close a transient hover popover once the pointer has left both parts. */
function queueClose() {
  if (pinned.value) return;
  cancelClose();
  closeTimer = window.setTimeout(() => {
    if (isOpen.value) activeHelpUid.value = null;
  }, 140);
}

function cancelClose() {
  if (closeTimer != null) window.clearTimeout(closeTimer);
  closeTimer = null;
}

function close() {
  cancelClose();
  pinned.value = false;
  if (isOpen.value) activeHelpUid.value = null;
}

function toggle() {
  if (isOpen.value && pinned.value) { close(); return; }
  show();
  pinned.value = true;
}

function onOutsidePointer(event) {
  if (!isOpen.value || trigger.value?.contains(event.target) || panel.value?.contains(event.target)) return;
  close();
}

function onKeydown(event) {
  if (event.key !== "Escape" || !isOpen.value) return;
  close();
}

watch([isOpen, currentLocale], () => nextTick(positionPanel));
watch(isOpen, (open) => {
  if (!open) { pinned.value = false; cancelClose(); }
});
onMounted(() => {
  document.addEventListener("pointerdown", onOutsidePointer);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", positionPanel);
  window.addEventListener("scroll", positionPanel, true);
});
onUnmounted(() => {
  close();
  document.removeEventListener("pointerdown", onOutsidePointer);
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", positionPanel);
  window.removeEventListener("scroll", positionPanel, true);
});
</script>

<style scoped>
.help-tip { display: inline-flex; align-items: center; flex: 0 0 auto; vertical-align: middle; }
.help-tip-trigger { display: grid; place-items: center; width: 22px; height: 22px; min-width: 22px; min-height: 22px; padding: 0; border: 1px solid var(--border-strong); border-radius: 50%; background: rgba(255,255,255,.025); color: var(--secondary); box-shadow: none; font: 700 12px/1 var(--font-ui); cursor: help; transition: background .16s ease, border-color .16s ease, color .16s ease; }
.help-tip-trigger:hover, .help-tip-trigger[aria-expanded="true"] { border-color: #637184; background: var(--surface-hover); color: var(--text); }
.help-tip-trigger:focus-visible { outline: 2px solid var(--secondary); outline-offset: 3px; }
.help-tip-panel { position: fixed; z-index: 1000; width: min(300px, calc(100vw - 24px)); padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--surface-2); box-shadow: 0 5px 16px #0007; color: var(--secondary); text-align: left; pointer-events: auto; }
.help-tip-panel p { margin: 0; color: inherit; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-width: 680px) { .help-tip-trigger { width: 26px; height: 26px; min-width: 26px; min-height: 26px; } }
@media (prefers-reduced-motion: reduce) { .help-tip-trigger { transition: none; } }
</style>

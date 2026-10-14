<template>
  <div class="page calibration-page">
    <label v-if="developmentPreview" class="calibration-preview-step">
      <span>Preview step</span>
      <select aria-label="Preview calibration step" :value="previewStep" @change="choosePreviewStep($event.target.value)">
        <option value="">Current calibration step</option>
        <option v-for="item in previewSteps" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select>
      <small>Debug build · Switch views for screenshots.</small>
    </label>
    <p v-if="scope === 'sticks'" class="calibration-scope-note">Only stick calibration will change; trigger calibration is preserved.</p>
    <CalibrationWizard
      :step="displayedStep"
      :scope="scope"
      :preview="previewActive"
      :busy="busy"
      :offline="offline"
      :error="previewActive ? '' : error"
      :calibration-mode="previewActive ? previewCalibrationMode : calibrationMode"
      :neutral-result="neutralResult"
      :center-capture-active="!previewActive && centerCaptureActive"
      :center-capture-status="centerCaptureStatus"
      :left-range="leftRange"
      :right-range="rightRange"
      :trigger-capture-active="!previewActive && triggerCaptureActive"
      :trigger-window-count="triggerWindowCount"
      :calibration-valid="calibrationValid"
      @mode="handleMode"
      @primary="handlePrimary"
      @back="handleBack"
      @cancel="handleCancel"
    >
      <template #validation>
        <ul class="check-list calibration-review">
          <li v-for="check in checks" :key="check.label" :class="checkStatus(check)">
            <strong>{{ checkStatus(check).toUpperCase() }}</strong>
            <span>{{ check.label }}</span>
            <small>{{ check.detail }}</small>
          </li>
        </ul>
      </template>
    </CalibrationWizard>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { calibrationSteps } from "../calibration.js";
import CalibrationWizard from "../CalibrationWizard.vue";

function checkStatus(check) {
  return check.status || (check.pass ? "pass" : "fail");
}

const props = defineProps({
  scope: { type: String, default: "automatic" },
  step: String, busy: Boolean, offline: Boolean, error: String, neutralResult: Object, leftRange: Object,
  calibrationMode: String, developmentPreview: Boolean,
  centerCaptureActive: Boolean, centerCaptureStatus: Object,
  rightRange: Object, triggerCaptureActive: Boolean, triggerWindowCount: Number,
  calibrationValid: Boolean, checks: Array,
});
const emit = defineEmits(["primary", "back", "cancel", "mode"]);
const previewStep = ref("");
const previewCalibrationMode = ref("quick");
const previewSteps = computed(() => [
  { id: "trigger-start", label: "Trigger calibration" },
  { id: "neutral", label: "Stick center calibration" },
  { id: "sticks-range", label: "Both stick ranges and roundness" },
  { id: "triggers-released", label: "Trigger released points" },
  { id: "triggers-pressed", label: "Trigger press/release cycles" },
  { id: "validate-calibration", label: "Review and apply calibration" },
  { id: "save", label: "Save calibration" },
  { id: "complete", label: "Calibration complete" },
].filter(item => calibrationSteps(props.scope).includes(item.id)));
const previewActive = computed(() => props.developmentPreview && previewStep.value !== "");
const displayedStep = computed(() => previewActive.value ? previewStep.value : props.step);
/** @brief Select a debug-only view without changing the live calibration transaction. */
function choosePreviewStep(value) {
  if (!props.developmentPreview || (value !== "" && !previewSteps.value.some(item => item.id === value))) return;
  previewStep.value = value;
}
/** @brief Keep mode changes local while previewing a calibration stage. */
function handleMode(value) {
  if (previewActive.value) previewCalibrationMode.value = value;
  else emit("mode", value);
}
/** @brief Forward real workflow actions only when showing the live stage. */
function handlePrimary() {
  if (!previewActive.value) emit("primary");
}
/** @brief Navigate the debug view or forward the real Back action. */
function handleBack() {
  if (!previewActive.value) { emit("back"); return; }
  const index = previewSteps.value.findIndex(item => item.id === previewStep.value);
  if (index > 0) previewStep.value = previewSteps.value[index - 1].id;
}
/** @brief Exit the debug view while retaining the live calibration state. */
function handleCancel() {
  if (previewActive.value) previewStep.value = "";
  else emit("cancel");
}
</script>

<style scoped>
.calibration-preview-step { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; margin: 0 0 20px; font-size: 12px; }
.calibration-preview-step select { min-width: 240px; max-width: 100%; font-size: 12px; }
.calibration-preview-step small { color: var(--muted); }
</style>

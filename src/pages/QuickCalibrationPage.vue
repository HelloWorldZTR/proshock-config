<template>
  <div class="page calibration-page">
    <header class="page-heading">
      <p class="eyebrow">Device-level physical calibration</p>
      <h1>Analog Calibration</h1>
      <p class="calibration-promise">Calibration captures raw ADC before any Profile shape. Firmware applies the saved physical correction first, then reapplies the selected circle, rounded-square, square, octagon, or custom shape.</p>
    </header>
    <CalibrationWizard
      :step="step"
      :busy="busy"
      :error="error"
      :calibration-mode="calibrationMode"
      :neutral-result="neutralResult"
      :center-capture-active="centerCaptureActive"
      :center-capture-status="centerCaptureStatus"
      :left-range="leftRange"
      :right-range="rightRange"
      :trigger-capture-active="triggerCaptureActive"
      :trigger-window-count="triggerWindowCount"
      :calibration-valid="calibrationValid"
      @mode="$emit('mode', $event)"
      @primary="$emit('primary')"
      @back="$emit('back')"
      @cancel="$emit('cancel')"
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
      <template #save>
        <div class="save-explainer">
          <strong>Apply is in RAM. Save persists through the firmware A/B flash service.</strong>
          <p>All 384 bytes of all four Profiles are verified unchanged before this step completes.</p>
        </div>
      </template>
    </CalibrationWizard>
  </div>
</template>

<script setup>
import CalibrationWizard from "../CalibrationWizard.vue";

function checkStatus(check) {
  return check.status || (check.pass ? "pass" : "fail");
}

defineProps({
  step: String, busy: Boolean, error: String, neutralResult: Object, leftRange: Object,
  calibrationMode: String,
  centerCaptureActive: Boolean, centerCaptureStatus: Object,
  rightRange: Object, triggerCaptureActive: Boolean, triggerWindowCount: Number,
  calibrationValid: Boolean, checks: Array,
});
defineEmits(["primary", "back", "cancel", "mode"]);
</script>

<template>
  <section class="wizard">
    <div class="wizard-progress">
      <span>{{ stepNumber }}/{{ visibleStepCount }}</span>
      <div><i :style="{ width: `${progress}%` }"></i></div>
    </div>
    <header>
      <p class="eyebrow">Analog calibration</p>
      <h2>{{ title }}</h2>
      <p>{{ instruction }}</p>
    </header>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-if="step === 'triggers-pressed'">
      Detected press/release cycles: {{ triggerWindowCount }}/5
    </p>
    <div
      v-if="step === 'neutral'"
      class="center-return-guide"
      aria-live="polite"
    >
      <div class="center-return-status">
        <strong>{{ centerStatusLabel }}</strong>
        <span>{{ centerCaptureStatus?.completed || 0 }}/4 returns recorded · {{ centerCaptureStatus?.readySamples || 0 }}/16 ready</span>
      </div>
      <ol class="center-return-directions" aria-label="Center return directions">
        <li
          v-for="(direction, index) in centerDirections"
          :key="direction.id"
          :class="centerDirectionState(index)"
        >
          <i>{{ index + 1 }}</i>
          <span>{{ direction.label }}</span>
          <small>{{ centerDirectionState(index) }}</small>
        </li>
      </ol>
      <p v-if="centerCaptureStatus?.insufficientSamples" class="center-confirm-note warning">
        Keep the sticks released briefly, then confirm again.
      </p>
    </div>
    <div v-if="step === 'neutral' && neutralResult" class="calibration-summary">
      <div v-for="axis in neutralResult.axes" :key="axis.name" class="metric">
        <span>{{ axis.name }} noise span</span>
        <strong>{{ axis.noiseSpan.toFixed(1) }}</strong>
      </div>
    </div>
    <div v-if="step === 'sticks-range'" class="coverage-pair">
      <div v-for="range in stickRanges" :key="range.label" class="coverage-block">
        <strong>{{ range.label }}</strong>
        <small>Outer-edge samples per direction (8 required)</small>
        <div class="coverage-grid">
          <span
            v-for="(count, index) in range.data?.sectorCounts || Array(16).fill(0)"
            :key="index"
            :class="{ covered: count >= 8 }"
          >{{ index }} · {{ Math.min(count, 8) }}/8{{ count >= 8 ? " ✓" : "" }}</span>
        </div>
      </div>
    </div>
    <slot v-if="step === 'validate-calibration'" name="validation"></slot>
    <slot v-if="step === 'save'" name="save"></slot>

    <footer class="wizard-actions">
      <button type="button" :disabled="busy || stepNumber <= 1 || step === 'save'" @click="$emit('back')">Back</button>
      <button type="button" :disabled="busy" @click="$emit('cancel')">Cancel</button>
      <button type="button" class="primary wizard-primary" :disabled="busy || primaryDisabled" @click="$emit('primary')">
        <span>{{ busy ? "Working…" : primaryLabel }}</span>
        <span
          v-if="showControllerConfirmIcons"
          class="controller-confirm-buttons"
          aria-label="Cross or Circle button"
        >
          <img :src="crossIcon" alt="Cross button">
          <img :src="circleIcon" alt="Circle button">
        </span>
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { CENTER_RETURN_DIRECTIONS, WIZARD_STEPS } from "./calibration.js";
import crossIcon from "./assets/PlayStation_button_X.svg";
import circleIcon from "./assets/PlayStation_button_C.svg";

const props = defineProps({
  step: { type: String, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
  neutralResult: { type: Object, default: null },
  centerCaptureActive: { type: Boolean, default: false },
  centerCaptureStatus: { type: Object, default: null },
  leftRange: { type: Object, default: null },
  rightRange: { type: Object, default: null },
  triggerCaptureActive: { type: Boolean, default: false },
  triggerWindowCount: { type: Number, default: 0 },
  calibrationValid: { type: Boolean, default: false },
});

defineEmits(["back", "cancel", "primary"]);

const visibleSteps = WIZARD_STEPS.filter((step) => step !== "backup" && step !== "complete");
const visibleStepCount = visibleSteps.length;
const stepNumber = computed(() => Math.max(1, visibleSteps.indexOf(props.step) + 1));
const progress = computed(() => stepNumber.value / visibleStepCount * 100);
const stickRanges = computed(() => [
  { label: "Left stick", data: props.leftRange },
  { label: "Right stick", data: props.rightRange },
]);
const centerDirections = CENTER_RETURN_DIRECTIONS;

function centerDirectionState(index) {
  const completed = props.centerCaptureStatus?.completed || 0;
  if (index < completed) return "recorded";
  if (props.centerCaptureActive && index === completed) return "current";
  return "pending";
}

const centerStatusLabel = computed(() => {
  if (!props.centerCaptureActive) {
    return "Ready to measure four spring returns";
  }
  const direction = props.centerCaptureStatus?.direction?.label || "Top left";
  return {
    "waiting-confirmation": `Push both sticks fully ${direction}, release them, then confirm when centered`,
    complete: "Four center returns recorded",
  }[props.centerCaptureStatus?.phase]
    || `Push both sticks fully ${direction}, release them, then confirm when centered`;
});

const showControllerConfirmIcons = computed(() => (
  props.step !== "complete"
  && !(props.step === "triggers-pressed" && props.triggerCaptureActive)
));

const copy = {
  neutral: ["Four-corner center return", "For each shown direction, push both sticks fully, release them, wait for the center you want, then confirm from the controller."],
  "sticks-range": ["Both stick ranges and roundness", "Sampling has started. Rotate both sticks around their outer gates until both coverage grids are complete, then continue once."],
  "triggers-released": ["Trigger released points", "Leave L2 and R2 completely released while a stable window is sampled."],
  "triggers-pressed": ["Trigger press/release cycles", "Detection has started. Press L2 and R2 fully, then release both; repeat five times. No extra clicks are needed."],
  "validate-calibration": ["Review and apply calibration", "Review the physical bounds, sector coverage, and return stability. Apply updates RAM after automatic firmware and Profile integrity checks."],
  save: ["Save to flash", "Calibration is active in RAM and its runtime state has been verified. Save explicitly commits it through the low-priority A/B flash service."],
};

const title = computed(() => copy[props.step]?.[0] || "Calibration complete");
const instruction = computed(() => (
  props.step === "neutral" && props.centerCaptureActive
    ? centerStatusLabel.value
    : copy[props.step]?.[1] || "The analog calibration workflow is complete."
));
const primaryLabel = computed(() => ({
  neutral: props.centerCaptureActive ? "Listening…" : "Start center capture",
  "sticks-range": "Finish both sticks",
  "triggers-released": "Capture released",
  "triggers-pressed": props.triggerCaptureActive ? "Listening…" : "Retry detection",
  "validate-calibration": "Apply calibration",
  save: "Save",
}[props.step] || "Continue"));

const primaryDisabled = computed(() => (
  (props.step === "validate-calibration" && !props.calibrationValid)
  || (props.step === "triggers-pressed" && props.triggerCaptureActive)
  || (props.step === "neutral" && props.centerCaptureActive)
));
</script>

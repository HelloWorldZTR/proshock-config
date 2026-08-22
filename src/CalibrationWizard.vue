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

    <div v-if="step === 'neutral'" class="calibration-mode-switch" aria-label="Center calibration mode">
      <button
        type="button"
        :class="{ active: calibrationMode === 'quick' }"
        :disabled="centerCaptureActive"
        @click="$emit('mode', 'quick')"
      >
        <strong>Quick · Default</strong>
        <span>Keep both sticks centered for one automatic sample window.</span>
      </button>
      <button
        type="button"
        :class="{ active: calibrationMode === 'standard' }"
        :disabled="centerCaptureActive"
        @click="$emit('mode', 'standard')"
      >
        <strong>Standard</strong>
        <span>Push and release four diagonals; each return is recorded automatically.</span>
      </button>
    </div>

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
        <span>{{ centerProgressLabel }}</span>
      </div>
      <ol
        v-if="calibrationMode === 'standard'"
        class="center-return-directions"
        aria-label="Center return directions"
      >
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
      <p v-if="centerCaptureActive" class="center-confirm-note">
        {{ calibrationMode === "quick"
          ? "Do not touch either stick until the center window completes."
          : "Wait until the current direction is marked recorded before starting the next one." }}
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
  calibrationMode: { type: String, default: "quick" },
  neutralResult: { type: Object, default: null },
  centerCaptureActive: { type: Boolean, default: false },
  centerCaptureStatus: { type: Object, default: null },
  leftRange: { type: Object, default: null },
  rightRange: { type: Object, default: null },
  triggerCaptureActive: { type: Boolean, default: false },
  triggerWindowCount: { type: Number, default: 0 },
  calibrationValid: { type: Boolean, default: false },
});

defineEmits(["back", "cancel", "mode", "primary"]);

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
    return props.calibrationMode === "quick"
      ? "Ready for a quick neutral sample"
      : "Ready to measure four spring returns";
  }
  const direction = props.centerCaptureStatus?.direction?.label || "Top left";
  return {
    settling: "Settling before the quick center window",
    "capturing-quick": "Capturing both sticks at rest",
    baseline: "Hold both sticks centered while the baseline is measured",
    "awaiting-deflection": `Push both sticks fully ${direction}`,
    "awaiting-return": `Release both sticks from ${direction}`,
    "capturing-return": `Hold centered while the ${direction} return is recorded`,
    complete: "Four center returns recorded",
  }[props.centerCaptureStatus?.phase]
    || "Listening for stick movement";
});

const centerProgressLabel = computed(() => {
  const ready = props.centerCaptureStatus?.readySamples || 0;
  if (props.calibrationMode === "quick") {
    return `${ready}/16 center samples`;
  }
  return `${props.centerCaptureStatus?.completed || 0}/4 returns recorded · ${ready}/16 center samples`;
});

const showControllerConfirmIcons = computed(() => (
  props.step !== "complete"
  && props.step !== "neutral"
  && !(props.step === "triggers-pressed" && props.triggerCaptureActive)
));

const copy = {
  neutral: ["Stick center calibration", "Choose quick neutral sampling or automatic four-direction return measurement."],
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
  neutral: props.centerCaptureActive
    ? "Listening…"
    : props.calibrationMode === "quick" ? "Start quick calibration" : "Start standard calibration",
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

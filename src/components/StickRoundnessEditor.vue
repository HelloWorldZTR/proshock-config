<template>
  <section class="roundness-editor shape-workspace">
    <header class="shape-heading">
      <div><h1>Stick shape</h1><p>Current Profile · Edit, apply, then test.</p></div>
      <StickSwitcher v-model="selectedStick" />
    </header>
    <StickPanelTransition :selected-stick="selectedStick">
      <article :key="selectedStick" class="shape-editor-panel">
        <div class="shape-chart-column">
            <svg
              class="roundness-drag-chart"
              viewBox="-140 -140 280 280"
              role="application"
              :aria-label="`${sticks[selectedStick].label} draggable roundness chart`"
              @pointerdown="startDrag($event, selectedStick)"
              @pointermove="continueDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
            >
              <circle cx="0" cy="0" r="105" class="roundness-tolerance-guide" />
              <circle cx="0" cy="0" r="100" class="roundness-standard-circle" />
              <circle cx="0" cy="0" r="95" class="roundness-tolerance-guide" />
              <line
                v-for="sector in sectorIndexes"
                :key="`spoke-${sector}`"
                x1="0"
                y1="0"
                :x2="polarPoint(1.25, sector).x"
                :y2="polarPoint(1.25, sector).y"
                class="roundness-sector-spoke"
              />
              <polygon :points="targetTrace(selectedStick)" class="roundness-target-shape" />

              <polygon
                v-if="captureResult(selectedStick).complete"
                :points="measuredTrace(selectedStick)"
                class="roundness-measured-fill"
                :class="captureResult(selectedStick).pass ? 'good' : 'bad'"
              />
              <line
                v-for="segment in measuredSegments(selectedStick)"
                :key="segment.key"
                :x1="segment.from.x"
                :y1="segment.from.y"
                :x2="segment.to.x"
                :y2="segment.to.y"
                class="roundness-measured-segment"
                :class="segment.status"
              />
              <circle
                v-for="point in measuredPoints(selectedStick)"
                :key="`measured-${point.sector}`"
                :cx="point.x"
                :cy="point.y"
                r="3.5"
                class="roundness-measured-point"
                :class="point.status"
              />

              <circle
                v-for="sector in sectorIndexes"
                :key="`handle-${sector}`"
                :cx="handlePoint(selectedStick, sector).x"
                :cy="handlePoint(selectedStick, sector).y"
                r="6"
                tabindex="0"
                role="slider"
                :aria-label="`${sticks[selectedStick].label} shape sector ${sector}`"
                :aria-valuemin="0"
                :aria-valuemax="65535"
                :aria-valuenow="sectorValue(selectedStick, sector)"
                class="roundness-drag-handle"
                @keydown.stop="adjustWithKeyboard($event, selectedStick, sector)"
              />
              <circle
                :cx="livePoint(selectedStick).x"
                :cy="livePoint(selectedStick).y"
                r="4.5"
                class="roundness-live-point"
              />
            </svg>
          <div class="roundness-legend" aria-label="Roundness chart legend"><span class="target">Slot target</span><span class="standard">Standard circle</span><span class="good">Measured · within ±5%</span><span class="bad">Measured · outside ±5%</span></div>
        </div>
        <aside class="shape-controls">
          <section><h2>Shape presets</h2><div class="roundness-preset-row"><button v-for="preset in presets" :key="preset.id" type="button" :class="{ active: activePreset(selectedStick) === preset.id }" @click="selectPreset(selectedStick, preset.id)">{{ preset.label }}</button></div></section>
          <section class="shape-test-section">
            <header><h2>Device test</h2><span class="roundness-result-badge" :class="resultClass(selectedStick)">{{ resultLabel(selectedStick) }}</span></header>
            <p>{{ canTest ? 'Rotate the selected stick around its outer edge.' : 'Connect and apply pending changes before testing.' }}</p>
            <div class="roundness-test-actions"><button type="button" :disabled="!canTest" :class="{ active: testActive }" @click="toggleTest">{{ testActive ? 'Stop actual test' : 'Start actual test' }}</button><button type="button" :disabled="!hasSamples" @click="clearStickCapture(selectedStick)">Clear trace</button></div>
            <dl class="roundness-test-summary"><div><dt>Coverage</dt><dd>{{ captureResult(selectedStick).coverage }}/16</dd></div><div><dt>Target error</dt><dd>{{ formatError(captureResult(selectedStick).errorPercent) }}</dd></div><div><dt>Live radius</dt><dd>{{ canTest ? liveRadius(selectedStick) : '—' }}</dd></div><div><dt>Adjusted sectors</dt><dd>{{ changedSectorCount(selectedStick) }}/16</dd></div></dl>
          </section>
        </aside>
          <details class="roundness-precision-values">
            <summary>Precise sector values</summary>
            <p>Post-flip coordinates: S0 right · S4 down · S8 left · S12 up. Q1.15 neutral is 32768.</p>
            <div class="roundness-raw-grid">
              <label v-for="sector in sectorIndexes" :key="sector">
                <span><b>S{{ sector }}</b><small>{{ sectorDirection(sector) }}</small></span>
                <input
                  type="number"
                  min="0"
                  max="65535"
                  step="1"
                  :aria-label="`${sticks[selectedStick].label} sector ${sector} raw value`"
                  :value="sectorValue(selectedStick, sector)"
                  @input="updateSector(selectedStick, sector, $event.target.value)"
                >
              </label>
            </div>
          </details>
      </article>
    </StickPanelTransition>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import StickSwitcher from "./StickSwitcher.vue";
import StickPanelTransition from "./StickPanelTransition.vue";
import { Q15_ONE, ROUNDNESS_SECTOR_COUNT } from "../protocol.js";
import {
  USER_SHAPE_Q15_DEFAULT,
  USER_SHAPE_PRESET,
  clampUserShapeQ15,
  createLatestFrameUpdate,
  createUserShapePreset,
  detectUserShapePreset,
  userShapeQ15FromRadius,
  userShapeTracePoints,
} from "../roundness-editor.js";
import {
  analyzeRoundnessAgainstTarget,
  createRoundnessCapture,
  recordRoundnessSample,
  roundnessTracePoints,
} from "../roundness.js";

const props = defineProps({
  profile: { type: Object, required: true },
  snapshot: { type: Object, default: null },
  canTest: { type: Boolean, default: false },
});
const emit = defineEmits(["update"]);
const sectorIndexes = Array.from({ length: ROUNDNESS_SECTOR_COUNT }, (_, index) => index);
const sticks = [{ label: "Left stick" }, { label: "Right stick" }];
const presets = [
  { id: USER_SHAPE_PRESET.CIRCLE, label: "Circle shape" },
  { id: USER_SHAPE_PRESET.SQUIRCLE, label: "Rounded square" },
  { id: USER_SHAPE_PRESET.SQUARE, label: "Square shape" },
  { id: USER_SHAPE_PRESET.OCTAGON, label: "Octagon shape" },
  { id: USER_SHAPE_PRESET.CUSTOM, label: "Custom shape" },
];
const testActive = ref(false);
const selectedStick = ref(0);
const captures = ref([createRoundnessCapture(), createRoundnessCapture()]);
const dragState = ref(null);
const dragUpdates = createLatestFrameUpdate(
  (callback) => window.requestAnimationFrame(callback),
  (frameId) => window.cancelAnimationFrame(frameId),
  ({ point, stickIndex }) => updateFromPoint(point, stickIndex),
);
const hasSamples = computed(() => captures.value[selectedStick.value].sampleCount > 0);
const liveValues = computed(() => {
  const values = props.snapshot?.output_stick_q15;
  if (!values || values.length < 4) return [0, 0, 0, 0];
  return values.map((value) => Math.max(-1.25, Math.min(1.25, value / Q15_ONE)));
});

function sectorValues(stickIndex) {
  return props.profile?.stick_shape?.[stickIndex]?.scale_q15
    || Array(ROUNDNESS_SECTOR_COUNT).fill(USER_SHAPE_Q15_DEFAULT);
}

function sectorValue(stickIndex, sector) {
  return sectorValues(stickIndex)[sector] ?? USER_SHAPE_Q15_DEFAULT;
}

function targetRadii(stickIndex) {
  return sectorValues(stickIndex).map((value) => (
    clampUserShapeQ15(value) / USER_SHAPE_Q15_DEFAULT
  ));
}

function activePreset(stickIndex) {
  return detectUserShapePreset(sectorValues(stickIndex));
}

function presetLabel(stickIndex) {
  return {
    [USER_SHAPE_PRESET.CIRCLE]: "Circle preset",
    [USER_SHAPE_PRESET.SQUIRCLE]: "Rounded-square preset",
    [USER_SHAPE_PRESET.SQUARE]: "Square preset",
    [USER_SHAPE_PRESET.OCTAGON]: "Octagon preset",
    [USER_SHAPE_PRESET.CUSTOM]: "User custom",
  }[activePreset(stickIndex)];
}

function selectPreset(stickIndex, preset) {
  if (preset === USER_SHAPE_PRESET.CUSTOM) return;
  clearStickCapture(stickIndex);
  createUserShapePreset(preset).forEach((scaleQ15, sector) => {
    emit("update", { stickIndex, sector, scaleQ15 });
  });
}

function updateSector(stickIndex, sector, rawValue) {
  clearStickCapture(stickIndex);
  emit("update", {
    stickIndex,
    sector,
    scaleQ15: clampUserShapeQ15(rawValue),
  });
}

function targetTrace(stickIndex) {
  return userShapeTracePoints(sectorValues(stickIndex));
}

function measuredTrace(stickIndex) {
  return roundnessTracePoints(captures.value[stickIndex]);
}

function captureResult(stickIndex) {
  return analyzeRoundnessAgainstTarget(
    captures.value[stickIndex],
    targetRadii(stickIndex),
  );
}

function polarPoint(radius, sector) {
  const angle = sector * Math.PI * 2 / ROUNDNESS_SECTOR_COUNT;
  return {
    x: Number((Math.cos(angle) * radius * 100).toFixed(2)),
    y: Number((Math.sin(angle) * radius * 100).toFixed(2)),
  };
}

function handlePoint(stickIndex, sector) {
  return polarPoint(targetRadii(stickIndex)[sector], sector);
}

function measuredPoints(stickIndex) {
  const capture = captures.value[stickIndex];
  const result = captureResult(stickIndex);
  return capture.radii.flatMap((radius, sector) => (
    radius > 0
      ? [{ sector, ...polarPoint(radius, sector), status: result.sectorStatus[sector] }]
      : []
  ));
}

function measuredSegments(stickIndex) {
  const capture = captures.value[stickIndex];
  const result = captureResult(stickIndex);
  return sectorIndexes.flatMap((sector) => {
    const next = (sector + 1) % ROUNDNESS_SECTOR_COUNT;
    if (!(capture.radii[sector] > 0) || !(capture.radii[next] > 0)) return [];
    return [{
      key: `${sector}-${next}`,
      from: polarPoint(capture.radii[sector], sector),
      to: polarPoint(capture.radii[next], next),
      status: result.sectorStatus[sector] === "good"
        && result.sectorStatus[next] === "good" ? "good" : "bad",
    }];
  });
}

function livePoint(stickIndex) {
  return {
    x: liveValues.value[stickIndex * 2] * 100,
    y: liveValues.value[stickIndex * 2 + 1] * 100,
  };
}

function liveRadius(stickIndex) {
  const point = livePoint(stickIndex);
  return (Math.hypot(point.x, point.y) / 100).toFixed(3);
}

function pointerPosition(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width * 280) - 140,
    y: ((event.clientY - bounds.top) / bounds.height * 280) - 140,
  };
}

function updateFromPoint(point, stickIndex) {
  const turns = Math.atan2(point.y, point.x) / (Math.PI * 2);
  const sector = (
    Math.round(turns * ROUNDNESS_SECTOR_COUNT) + ROUNDNESS_SECTOR_COUNT
  ) % ROUNDNESS_SECTOR_COUNT;
  const radius = Math.hypot(point.x, point.y) / 100;
  updateSector(stickIndex, sector, userShapeQ15FromRadius(radius));
}

function queuePointerUpdate(event, stickIndex) {
  dragUpdates.push({ point: pointerPosition(event), stickIndex });
}

function startDrag(event, stickIndex) {
  dragState.value = { pointerId: event.pointerId, stickIndex };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  queuePointerUpdate(event, stickIndex);
}

function continueDrag(event) {
  if (!dragState.value || dragState.value.pointerId !== event.pointerId) return;
  queuePointerUpdate(event, dragState.value.stickIndex);
}

function endDrag(event) {
  if (dragState.value?.pointerId !== event.pointerId) return;
  if (event.type === "pointercancel") {
    dragUpdates.cancel();
  } else {
    queuePointerUpdate(event, dragState.value.stickIndex);
    dragUpdates.flush();
  }
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  dragState.value = null;
}

function adjustWithKeyboard(event, stickIndex, sector) {
  const delta = {
    ArrowUp: 256,
    ArrowRight: 256,
    ArrowDown: -256,
    ArrowLeft: -256,
  }[event.key];
  if (delta == null) return;
  event.preventDefault();
  updateSector(stickIndex, sector, sectorValue(stickIndex, sector) + delta);
}

function resetCaptures() {
  captures.value = [createRoundnessCapture(), createRoundnessCapture()];
}

function clearStickCapture(stickIndex) {
  testActive.value = false;
  const next = [...captures.value];
  next[stickIndex] = createRoundnessCapture();
  captures.value = next;
}

function toggleTest() {
  if (!props.canTest) return;
  if (!testActive.value) clearStickCapture(selectedStick.value);
  testActive.value = !testActive.value;
}

function resultClass(stickIndex) {
  const result = captureResult(stickIndex);
  if (!result.complete) return "collecting";
  return result.pass ? "good" : "bad";
}

function resultLabel(stickIndex) {
  const result = captureResult(stickIndex);
  if (!result.complete) return testActive.value ? "Collecting" : "Not tested";
  return result.pass ? "Pass" : "Needs adjustment";
}

function formatError(value) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function changedSectorCount(stickIndex) {
  return sectorValues(stickIndex)
    .filter((value) => value !== USER_SHAPE_Q15_DEFAULT).length;
}

function sectorDirection(sector) {
  return {
    0: "Right",
    4: "Down",
    8: "Left",
    12: "Up",
  }[sector] || `${sector * 22.5}°`;
}

watch(
  () => props.snapshot?.output_stick_q15,
  (values) => {
    if (!props.canTest || !testActive.value || !values || values.length < 4) return;
    captures.value = captures.value.map((capture, stickIndex) => (
      stickIndex !== selectedStick.value ? capture : recordRoundnessSample(
        capture,
        values[stickIndex * 2] / Q15_ONE,
        values[stickIndex * 2 + 1] / Q15_ONE,
      )
    ));
  },
  { deep: true },
);

watch(selectedStick, () => { testActive.value = false; });
watch([() => props.canTest, () => props.snapshot?.runtime_generation, () => JSON.stringify(props.profile?.stick_shape)], () => {
  testActive.value = false;
  resetCaptures();
});
onBeforeUnmount(() => dragUpdates.cancel());
</script>

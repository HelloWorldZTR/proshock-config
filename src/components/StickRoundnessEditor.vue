<template>
  <section class="roundness-editor">
    <header class="roundness-editor-heading">
      <div>
        <p class="eyebrow">Physical stick boundary</p>
        <h2>Roundness detail</h2>
        <p>Adjust any of the 16 directions independently. Move the stick to confirm its live position on the pie.</p>
      </div>
      <button type="button" @click="resetBoth">Reset both sticks</button>
    </header>

    <div class="roundness-editor-grid">
      <article
        v-for="(stick, stickIndex) in sticks"
        :key="stick.label"
        class="roundness-editor-stick"
      >
        <header>
          <strong>{{ stick.label }}</strong>
          <span>{{ changedSectorCount(stickIndex) }}/16 adjusted</span>
        </header>

        <div class="roundness-pie-layout">
          <svg
            viewBox="-178 -178 356 356"
            role="img"
            :aria-label="`${stick.label} roundness boundary editor`"
          >
            <path
              v-for="sector in sectorIndexes"
              :key="sector"
              :d="sectorPaths[sector]"
              class="roundness-sector"
              :class="{
                selected: selectedSectors[stickIndex] === sector,
                live: stick.position.sector === sector,
              }"
              role="button"
              tabindex="0"
              :aria-label="sectorAriaLabel(stickIndex, sector)"
              @click="selectSector(stickIndex, sector)"
              @keydown.enter.prevent="selectSector(stickIndex, sector)"
              @keydown.space.prevent="selectSector(stickIndex, sector)"
            />
            <circle cx="0" cy="0" r="100" class="roundness-ideal-circle" />
            <line v-for="sector in sectorIndexes" :key="`line-${sector}`" v-bind="sectorLine(sector)" />
            <polygon :points="stick.points" class="roundness-boundary-shape" />
            <circle
              v-if="stick.position.radius >= 0.05"
              :cx="clampLive(stick.position.x) * 100"
              :cy="clampLive(stick.position.y) * 100"
              r="6"
              class="roundness-live-dot"
            />
            <text x="0" y="-163" text-anchor="middle">Up</text>
            <text x="163" y="4" text-anchor="middle">Right</text>
            <text x="0" y="170" text-anchor="middle">Down</text>
            <text x="-163" y="4" text-anchor="middle">Left</text>
          </svg>

          <div class="roundness-sector-control">
            <div>
              <span>Selected direction</span>
              <strong>{{ sectorLabel(selectedSectors[stickIndex]) }}</strong>
            </div>
            <label>
              <span>Boundary radius</span>
              <output>{{ formatPercent(stickIndex) }}%</output>
              <input
                type="range"
                min="85"
                max="150"
                step="0.1"
                :value="selectedPercent(stickIndex)"
                @input="updatePercent(stickIndex, $event.target.value)"
              >
            </label>
            <div class="roundness-sector-actions">
              <button type="button" @click="resetSector(stickIndex)">Reset direction</button>
              <button type="button" @click="resetStick(stickIndex)">Reset stick</button>
            </div>
            <small>100% is circular. A larger boundary makes full output harder to reach in this direction.</small>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive } from "vue";
import {
  ROUNDNESS_Q15_ONE,
  ROUNDNESS_SECTOR_COUNT,
} from "../protocol.js";
import {
  roundnessBoundaryPoints,
  roundnessEditorStickPosition,
  roundnessPercentToQ15,
  roundnessQ15ToPercent,
  roundnessSectorPath,
} from "../roundness-editor.js";

const props = defineProps({
  calibration: { type: Object, required: true },
  raw: { type: Object, default: null },
});
const emit = defineEmits(["update"]);
const sectorIndexes = Array.from({ length: ROUNDNESS_SECTOR_COUNT }, (_, index) => index);
const sectorPaths = sectorIndexes.map((sector) => roundnessSectorPath(sector));
const selectedSectors = reactive([0, 0]);

const sticks = computed(() => [0, 1].map((stickIndex) => ({
  label: stickIndex ? "Right stick" : "Left stick",
  points: roundnessBoundaryPoints(props.calibration?.stick?.[stickIndex]?.radius_q15),
  position: roundnessEditorStickPosition(props.raw, props.calibration, stickIndex),
})));

function selectSector(stickIndex, sector) {
  selectedSectors[stickIndex] = sector;
}

function selectedRadius(stickIndex) {
  const sector = selectedSectors[stickIndex];
  return props.calibration?.stick?.[stickIndex]?.radius_q15?.[sector]
    ?? ROUNDNESS_Q15_ONE;
}

function selectedPercent(stickIndex) {
  return roundnessQ15ToPercent(selectedRadius(stickIndex));
}

function formatPercent(stickIndex) {
  return selectedPercent(stickIndex).toFixed(1);
}

function updateRadius(stickIndex, sector, radiusQ15) {
  emit("update", { stickIndex, sector, radiusQ15 });
}

function updatePercent(stickIndex, percent) {
  updateRadius(
    stickIndex,
    selectedSectors[stickIndex],
    roundnessPercentToQ15(percent),
  );
}

function resetSector(stickIndex) {
  updateRadius(stickIndex, selectedSectors[stickIndex], ROUNDNESS_Q15_ONE);
}

function resetStick(stickIndex) {
  sectorIndexes.forEach((sector) => updateRadius(stickIndex, sector, ROUNDNESS_Q15_ONE));
}

function resetBoth() {
  resetStick(0);
  resetStick(1);
}

function changedSectorCount(stickIndex) {
  return props.calibration?.stick?.[stickIndex]?.radius_q15
    ?.filter((radius) => radius !== ROUNDNESS_Q15_ONE).length || 0;
}

function sectorLabel(sector) {
  const cardinal = {
    0: "Right",
    2: "Down-right",
    4: "Down",
    6: "Down-left",
    8: "Left",
    10: "Up-left",
    12: "Up",
    14: "Up-right",
  }[sector];
  return `Sector ${sector + 1} · ${cardinal || `${sector * 22.5}°`}`;
}

function sectorAriaLabel(stickIndex, sector) {
  const percent = roundnessQ15ToPercent(
    props.calibration?.stick?.[stickIndex]?.radius_q15?.[sector],
  ).toFixed(1);
  return `${sectorLabel(sector)}, ${percent}% boundary`;
}

function sectorLine(sector) {
  const angle = (sector + 0.5) * Math.PI * 2 / ROUNDNESS_SECTOR_COUNT;
  return {
    x1: 0,
    y1: 0,
    x2: (Math.cos(angle) * 150).toFixed(2),
    y2: (Math.sin(angle) * 150).toFixed(2),
  };
}

function clampLive(value) {
  return Math.max(-1.5, Math.min(1.5, Number(value) || 0));
}
</script>

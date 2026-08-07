<template>
  <section class="roundness-editor">
    <header class="roundness-editor-heading">
      <div>
        <p class="eyebrow">Profile stick shape</p>
        <h2>Roundness sector values</h2>
        <p>Edit the firmware Q1.15 raw value for each sector directly.</p>
      </div>
      <button type="button" @click="resetBoth">Reset both sticks</button>
    </header>

    <p class="roundness-sector-map">
      Sector coordinates after axis flip: S0 right · S4 down · S8 left · S12 up. Default raw value: 32768.
    </p>

    <div class="roundness-editor-grid">
      <article
        v-for="(stick, stickIndex) in sticks"
        :key="stick.label"
        class="roundness-editor-stick"
      >
        <header>
          <strong>{{ stick.label }}</strong>
          <span>{{ changedSectorCount(stickIndex) }}/16 adjusted</span>
          <button type="button" @click="resetStick(stickIndex)">Reset stick</button>
        </header>

        <div class="roundness-raw-grid">
          <label v-for="sector in sectorIndexes" :key="sector">
            <span>
              <b>S{{ sector }}</b>
              <small>{{ sectorDirection(sector) }}</small>
            </span>
            <input
              type="number"
              min="0"
              max="65535"
              step="1"
              :aria-label="`${stick.label} sector ${sector} raw value`"
              :value="sectorValue(stickIndex, sector)"
              @input="updateSector(stickIndex, sector, $event.target.value)"
            >
          </label>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { ROUNDNESS_SECTOR_COUNT } from "../protocol.js";
import {
  USER_SHAPE_Q15_DEFAULT,
  clampUserShapeQ15,
} from "../roundness-editor.js";

const props = defineProps({
  profile: { type: Object, required: true },
});
const emit = defineEmits(["update"]);
const sectorIndexes = Array.from({ length: ROUNDNESS_SECTOR_COUNT }, (_, index) => index);
const sticks = computed(() => [0, 1].map((stickIndex) => ({
  label: stickIndex ? "Right stick" : "Left stick",
})));

function sectorValue(stickIndex, sector) {
  return props.profile?.stick_shape?.[stickIndex]?.scale_q15?.[sector]
    ?? USER_SHAPE_Q15_DEFAULT;
}

function updateSector(stickIndex, sector, rawValue) {
  emit("update", {
    stickIndex,
    sector,
    scaleQ15: clampUserShapeQ15(rawValue),
  });
}

function resetStick(stickIndex) {
  sectorIndexes.forEach((sector) => {
    emit("update", {
      stickIndex,
      sector,
      scaleQ15: USER_SHAPE_Q15_DEFAULT,
    });
  });
}

function resetBoth() {
  resetStick(0);
  resetStick(1);
}

function changedSectorCount(stickIndex) {
  return props.profile?.stick_shape?.[stickIndex]?.scale_q15
    ?.filter((value) => value !== USER_SHAPE_Q15_DEFAULT).length || 0;
}

function sectorDirection(sector) {
  return {
    0: "Right",
    4: "Down",
    8: "Left",
    12: "Up",
  }[sector] || `${sector * 22.5}°`;
}
</script>

<template>
  <div class="rc-page-canvas">
    <header class="page-heading rc-page-heading">
      <div>
        <h1>RC filter</h1>
        <p>Shape calibrated stick motion before roundness, deadzone, and response curves.</p>
      </div>
      <StickSwitcher v-model="selectedStick" />
    </header>

    <CompetitiveRiskWarning />

    <div class="editor-split rc-editor-split">
      <div class="rc-editor-stack">
        <StickPanelTransition :selected-stick="selectedStick">
          <article
            :key="selectedStick"
            class="rc-stick-card"
          >
            <header>
              <div>
                <h2>{{ selectedStick === 0 ? "Left stick" : "Right stick" }}</h2>
              </div>
              <span class="rc-stick-index">S{{ selectedStick + 1 }}</span>
            </header>

            <section class="rc-stage-card">
              <div class="rc-stage-heading">
                <div>
                  <strong>Smoothing</strong>
                  <p>Low-pass filtering removes electromagnetic high-frequency noise.</p>
                </div>
                <label class="rc-stage-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Smoothing"
                    :checked="hasFlag(selectedRc, STICK_RC_FLAG_SMOOTHING)"
                    @change="setFlag(selectedStick, STICK_RC_FLAG_SMOOTHING, $event.target.checked)"
                  >
                  <span class="rc-switch-track" aria-hidden="true"></span>
                  <span>{{ hasFlag(selectedRc, STICK_RC_FLAG_SMOOTHING) ? "On" : "Off" }}</span>
                </label>
              </div>
              <RcFrequencyControl
                label="Smoothing cutoff"
                :disabled="!hasFlag(selectedRc, STICK_RC_FLAG_SMOOTHING)"
                :alpha-q15="selectedRc.smoothing_alpha_q15"
                @update="setCutoff(selectedStick, 'smoothing_alpha_q15', $event)"
              />
            </section>

            <section class="rc-stage-card">
              <div class="rc-stage-heading">
                <div>
                  <strong>Boost</strong>
                  <p>A band-limited derivative adds motion energy without passing the highest-frequency calculation jitter.</p>
                </div>
                <label class="rc-stage-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Boost"
                    :checked="hasFlag(selectedRc, STICK_RC_FLAG_BOOST)"
                    @change="setFlag(selectedStick, STICK_RC_FLAG_BOOST, $event.target.checked)"
                  >
                  <span class="rc-switch-track" aria-hidden="true"></span>
                  <span>{{ hasFlag(selectedRc, STICK_RC_FLAG_BOOST) ? "On" : "Off" }}</span>
                </label>
              </div>
              <RcFrequencyControl
                label="Fast cutoff"
                :disabled="!hasFlag(selectedRc, STICK_RC_FLAG_BOOST)"
                :alpha-q15="selectedRc.boost_fast_alpha_q15"
                :minimum-hz="slowHz(selectedRc) + 1"
                @update="setCutoff(selectedStick, 'boost_fast_alpha_q15', $event)"
              />
              <RcFrequencyControl
                label="Slow cutoff"
                :disabled="!hasFlag(selectedRc, STICK_RC_FLAG_BOOST)"
                :alpha-q15="selectedRc.boost_slow_alpha_q15"
                :maximum-hz="fastHz(selectedRc) - 1"
                @update="setCutoff(selectedStick, 'boost_slow_alpha_q15', $event)"
              />
              <label class="rc-control-row">
                <span>
                  <strong>Boost gain</strong>
                  <small>{{ gainText(selectedRc) }}</small>
                </span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  :disabled="!hasFlag(selectedRc, STICK_RC_FLAG_BOOST)"
                  :value="selectedRc.boost_gain_q8_8 / 256"
                  @input="setGain(selectedStick, $event.target.value)"
                >
                <input
                  class="rc-number-input"
                  type="number"
                  min="0"
                  max="2"
                  step="0.01"
                  :disabled="!hasFlag(selectedRc, STICK_RC_FLAG_BOOST)"
                  :value="(selectedRc.boost_gain_q8_8 / 256).toFixed(2)"
                  @change="setGain(selectedStick, $event.target.value)"
                >
              </label>
            </section>
          </article>
        </StickPanelTransition>
      </div>

      <InputViewer
        :raw="raw"
        :snapshot="snapshot"
        :calibration="calibration"
        :axis-invert="axisInvert"
        detail-kind="sticks"
        details-only
        mode="compact"
        title="Live preview"
        source-label="Firmware processed input"
      />
    </div>

    <section class="rc-frequency-section">
      <header>
        <div>
          <h2>Frequency response</h2>
        </div>
        <span class="rc-zero-key">0 dB · unchanged amplitude</span>
      </header>
      <div class="rc-chart-shell">
        <canvas ref="chartCanvas" aria-label="RC frequency response chart"></canvas>
      </div>
      <div class="rc-frequency-notes">
        <p><strong>Smoothing</strong> shows high-frequency attenuation from the first low-pass stage.</p>
        <p><strong>Boost</strong> shows the fast-minus-slow derivative contribution. Positive dB means amplification.</p>
        <p><strong>Final</strong> is the product of all enabled stages. The highlighted 0 dB line means unchanged amplitude.</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import {
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  STICK_RC_FLAG_BOOST,
  STICK_RC_FLAG_SMOOTHING,
  createDefaultStickRc,
} from "../protocol.js";
import {
  RC_MAX_CUTOFF_HZ,
  RC_MIN_CUTOFF_HZ,
  alphaQ15ToCutoffHz,
  cutoffHzToAlphaQ15,
  stickRcFrequencySeries,
} from "../rc-filter.js";
import StickSwitcher from "./StickSwitcher.vue";
import StickPanelTransition from "./StickPanelTransition.vue";
import CompetitiveRiskWarning from "./CompetitiveRiskWarning.vue";
import InputViewer from "./InputViewer.vue";
import RcFrequencyControl from "./RcFrequencyControl.vue";
import { currentLocale, translate } from "../i18n.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend,
);

const props = defineProps({
  profile: { type: Object, default: null },
  raw: { type: Object, default: null },
  snapshot: { type: Object, default: null },
  calibration: { type: Object, required: true },
  axisInvert: { type: Array, default: undefined },
});
const emit = defineEmits(["update"]);
const selectedStick = ref(0);
const chartCanvas = ref(null);
let chart = null;

const stickRc = computed(() => props.profile?.stick_rc || [
  createDefaultStickRc(),
  createDefaultStickRc(),
]);

const selectedRc = computed(() => stickRc.value[selectedStick.value]);

function hasFlag(rc, flag) {
  return (rc.flags & flag) !== 0;
}

function fastHz(rc) {
  return Math.round(alphaQ15ToCutoffHz(rc.boost_fast_alpha_q15));
}

function slowHz(rc) {
  return Math.round(alphaQ15ToCutoffHz(rc.boost_slow_alpha_q15));
}

function gainText(rc) {
  return `${(rc.boost_gain_q8_8 / 256).toFixed(2)}× · Q8.8 ${rc.boost_gain_q8_8}`;
}

function emitRc(stickIndex, value) {
  emit("update", { stickIndex, value });
}

function setFlag(stickIndex, flag, enabled) {
  const value = { ...stickRc.value[stickIndex] };
  value.flags = enabled ? value.flags | flag : value.flags & ~flag;
  emitRc(stickIndex, value);
}

function setCutoff(stickIndex, field, cutoffHz) {
  const value = { ...stickRc.value[stickIndex] };
  const minimum = field === "boost_fast_alpha_q15" ? slowHz(value) + 1 : RC_MIN_CUTOFF_HZ;
  const maximum = field === "boost_slow_alpha_q15" ? fastHz(value) - 1 : RC_MAX_CUTOFF_HZ;
  const bounded = Math.max(minimum, Math.min(maximum, Math.round(Number(cutoffHz))));
  value[field] = cutoffHzToAlphaQ15(bounded);
  emitRc(stickIndex, value);
}

function setGain(stickIndex, gain) {
  const value = { ...stickRc.value[stickIndex] };
  value.boost_gain_q8_8 = Math.max(0, Math.min(512, Math.round(Number(gain) * 256)));
  emitRc(stickIndex, value);
}

/** @brief Build response curves for the selected stick and the 0 dB guide. */
function responseDatasets() {
  const colors = ["#55d6ff", "#ffb020"];
  const stageStyle = {
    Smoothing: { borderDash: [3, 4], borderWidth: 1.4 },
    Boost: { borderDash: [8, 4], borderWidth: 1.4 },
    Final: { borderDash: [], borderWidth: 2.5 },
  };
  const datasets = stickRcFrequencySeries([stickRc.value[selectedStick.value]]).map((series) => {
    const stickIndex = selectedStick.value;
    const prefix = translate(stickIndex === 0 ? "Left stick" : "Right stick");
    return {
      label: `${prefix} · ${translate(series.stage)}`,
      data: series.points,
      borderColor: colors[stickIndex],
      ...stageStyle[series.stage],
      pointRadius: 0,
      tension: 0,
    };
  });
  datasets.push({
    label: translate("0 dB reference"),
    data: [{ x: 1, y: 0 }, { x: 4000, y: 0 }],
    borderColor: "rgba(255,255,255,.72)",
    borderDash: [2, 3],
    borderWidth: 1.5,
    pointRadius: 0,
  });
  return datasets;
}

function updateChart() {
  if (!chart) return;
  chart.data.datasets = responseDatasets();
  chart.options.scales.x.title.text = translate("Frequency (Hz)");
  chart.options.scales.y.title.text = translate("Magnitude (dB)");
  chart.update("none");
}

onMounted(() => {
  chart = new Chart(chartCanvas.value, {
    type: "line",
    data: { datasets: responseDatasets() },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { labels: { color: "#aebdca", boxWidth: 24, boxHeight: 2 } },
        tooltip: {
          callbacks: {
            title: (items) => `${Math.round(items[0].parsed.x)} Hz`,
            label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)} dB`,
          },
        },
      },
      scales: {
        x: {
          type: "logarithmic",
          min: 1,
          max: 4000,
          title: { display: true, text: translate("Frequency (Hz)"), color: "#7f91a1" },
          ticks: { color: "#7f91a1", maxTicksLimit: 9 },
          grid: { color: "rgba(255,255,255,.055)" },
        },
        y: {
          suggestedMin: -30,
          suggestedMax: 6,
          title: { display: true, text: translate("Magnitude (dB)"), color: "#7f91a1" },
          ticks: { color: "#7f91a1", callback: (value) => `${value} dB` },
          grid: { color: (context) => context.tick.value === 0 ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.055)" },
        },
      },
    },
  });
});

watch([() => props.profile?.stick_rc, selectedStick, currentLocale], updateChart, { deep: true });
onUnmounted(() => chart?.destroy());
</script>

<template>
  <div class="page accessory-page">
    <header class="accessory-header">
      <div><span class="accessory-kicker">PROSHOCK 4 / HARDWARE</span><h1>Accessory Center</h1><p>Select a connector to reveal its settings.</p></div>
      <span class="accessory-view-label"><i></i> 3D BOARD VIEW</span>
    </header>
    <nav class="accessory-selector" aria-label="Board connections">
      <button v-for="item in interfaces" :key="item.id" type="button" :class="{ active: active === item.id }" :aria-pressed="active === item.id" @click="selectItem(item.id)">
        <span>{{ item.number }}</span><strong>{{ item.name }}</strong><small>{{ item.detail }}</small>
      </button>
    </nav>
    <div ref="stage" class="accessory-stage">
      <Board3DViewer :active="active" :panel-side="panelSide" @select="selectItem" @pin-position="updatePinPosition" />
      <svg v-if="active && leader" :key="active" class="accessory-leader" :viewBox="`0 0 ${leader.width} ${leader.height}`" aria-hidden="true">
        <path :d="leaderPath" pathLength="1" />
        <circle :cx="leader.endX" :cy="leader.endY" r="3" />
      </svg>
      <Transition name="accessory-panel">
        <div v-if="active" :key="active" class="accessory-detail" :class="`side-${panelSide}`">
          <section class="accessory-detail-content">
            <div class="accessory-detail-top"><span>{{ selected.number }} / 05</span><span>{{ selected.detail }}</span></div>
            <h2>{{ selected.name }}</h2>
            <template v-if="active === 'wide'">
              <p>The 16-pin FPC2 carries the right-side buttons. HML changes L1/R1 polarity; L2/R2 direction is set independently.</p>
              <div class="accessory-setting"><div class="help-label"><label for="accessory-ribbon-mode">Ribbon mode</label><HelpTip id="R05" /></div><select id="accessory-ribbon-mode" :value="ribbonMode" :disabled="!connected || disabled || !configInfo?.ribbon_mode_supported" @change="$emit('ribbon-mode', Number($event.target.value))"><option :value="0">Original</option><option :value="1">HML</option></select></div>
              <div class="accessory-switches" role="group" aria-label="Trigger inversion">
                <label v-for="trigger in triggers" :key="trigger.channel"><span>{{ trigger.label }} invert</span><input type="checkbox" role="switch" :aria-label="`${trigger.label} invert`" :checked="isInverted(trigger.channel)" :disabled="!connected || disabled || !directionSupported" @change="$emit('direction', { channel: trigger.channel, inverted: $event.target.checked })"></label>
              </div>
              <p class="accessory-note">Apply and Save below to store changes.</p>
              <button type="button" class="accessory-link" @click="$emit('buttons')">Open Buttons <span aria-hidden="true">↗</span></button>
            </template>
            <template v-else-if="active === 'six'">
              <p>FPC4 is reserved for optional accessories.</p>
              <label class="accessory-setting"><span>Accessory</span><select aria-label="6-pin accessory" value="none"><option value="none">None</option><option value="oled" disabled>OLED · coming later</option><option value="adc" disabled>External ADC · coming later</option></select></label>
              <p class="accessory-note">OLED and external ADC have no firmware driver yet.</p>
            </template>
            <template v-else-if="active === 'u18'">
              <label class="accessory-setting"><span>Accessory</span><select aria-label="Onboard expansion accessory" :value="motion?.enabled ? 'motion' : 'none'" :disabled="!connected || disabled" @change="selectBoardExpansion($event.target.value)"><option value="none">None</option><option value="motion" :disabled="!motionSupported || !motion">Motion sensor</option><option value="adc" disabled>External ADC · coming later</option></select></label>
              <MotionSettings v-if="motionSupported && motion?.enabled" :model-value="motion" :supported="motionSupported" :disabled="!connected || disabled" :telemetry="motionTelemetry" :calibration="motionCalibration" @update:model-value="$emit('motion', $event)" @refresh="$emit('motion-refresh')" @calibrate="$emit('motion-calibrate')" @cancel="$emit('motion-cancel')" />
              <p v-else-if="!motionSupported" class="accessory-note">MPU-6050 requires firmware 0.5.3, build 2026100301 or newer.</p>
              <p v-else class="accessory-note">No onboard accessory is enabled.</p>
              <p class="accessory-note">Apply and Save below to store changes.</p>
            </template>
            <template v-else-if="active === 'daughter'">
              <p>FPC3 connects the expansion buttons. Configure their actions in Buttons.</p>
              <button type="button" class="accessory-link" @click="$emit('buttons')">Open Buttons <span aria-hidden="true">↗</span></button>
            </template>
            <template v-else>
              <p>K1–K8 are physical input pads on both sides of the board. Assign their actions in Buttons.</p>
              <button type="button" class="accessory-link" @click="$emit('buttons')">Open Buttons <span aria-hidden="true">↗</span></button>
            </template>
          </section>
          <div class="accessory-detail-footer"><span>BOARD REVISION</span><strong>PROSHOCK 4</strong></div>
        </div>
      </Transition>
      <div v-if="!active" class="accessory-idle-caption">SELECT A MARKER TO EXPLORE</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import Board3DViewer from "../components/Board3DViewer.vue";
import MotionSettings from "../components/MotionSettings.vue";
import HelpTip from "../components/HelpTip.vue";

const props = defineProps({ ribbonMode: Number, calibration: Object, configInfo: Object, connected: Boolean, disabled: Boolean, motion: Object, motionSupported: Boolean, motionTelemetry: Object, motionCalibration: Object });
const emit = defineEmits(["ribbon-mode", "direction", "buttons", "motion", "motion-refresh", "motion-calibrate", "motion-cancel"]);
const active = ref(null);
const stage = ref(null);
const leader = ref(null);
const interfaces = [
  { id: "six", number: "01", name: "6-pin expansion", detail: "FPC4", side: "right" },
  { id: "daughter", number: "02", name: "Expansion buttons", detail: "FPC3", side: "right" },
  { id: "u18", number: "03", name: "Onboard expansion", detail: "U18", side: "right" },
  { id: "wide", number: "04", name: "16-pin ribbon", detail: "FPC2", side: "right" },
  { id: "pads", number: "05", name: "Button pads", detail: "K1–K8", side: "left" },
];
const selected = computed(() => interfaces.find(item => item.id === active.value) || interfaces[1]);
const panelSide = computed(() => selected.value.side);
const leaderPath = computed(() => {
  if (!leader.value) return "";
  const { x, y, endX, endY } = leader.value;
  const bend = panelSide.value === "left" ? -72 : 72;
  return `M ${x} ${y} C ${x + bend} ${y}, ${endX - bend} ${endY}, ${endX} ${endY}`;
});
const directionSupported = computed(() => props.calibration?.calibration_version === 2);
const triggers = [{ channel: 4, label: "L2" }, { channel: 5, label: "R2" }];

/** @brief Select the supported onboard module while retaining its filter draft. */
function selectBoardExpansion(value) {
  if (!props.connected || props.disabled || !props.motionSupported || !props.motion) return;
  if (!["none", "motion"].includes(value)) return;
  emit("motion", { ...props.motion, enabled: value === "motion" ? 1 : 0 });
}

/** @brief Open one callout and let the board yield space on that side. */
function selectItem(id) {
  if (!interfaces.some(item => item.id === id)) return;
  leader.value = null;
  active.value = active.value === id ? null : id;
}

/** @brief Connect the projected model hotspot to the visible feature panel. */
function updatePinPosition({ x, y }) {
  if (!active.value || !stage.value) return;
  const width = stage.value.clientWidth;
  const height = stage.value.clientHeight;
  leader.value = {
    x, y, width, height,
    endX: panelSide.value === "left" ? 375 : width - 375,
    endY: Math.min(height - 80, Math.max(150, y)),
  };
}

/** @brief Read the draft trigger sign from calibration V2. */
function isInverted(channel) {
  return directionSupported.value && !!(props.calibration.direction_mask & (1 << channel));
}
</script>

<style scoped>
.accessory-page { padding-bottom: 40px; }
.accessory-header { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding: 29px 0 25px; }
.accessory-kicker { color: var(--accent); font: 10px var(--font-mono); letter-spacing: .15em; }
.accessory-header h1 { margin: 8px 0 6px; font-size: clamp(26px, 3vw, 36px); letter-spacing: -.035em; }
.accessory-header p { margin: 0; font-size: 12px; }
.accessory-view-label { display: flex; align-items: center; gap: 7px; color: var(--secondary); font: 10px var(--font-mono); letter-spacing: .08em; white-space: nowrap; }
.accessory-view-label i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 9px var(--accent); }
.accessory-selector { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--border); border-radius: 10px 10px 0 0; background: var(--border); }
.accessory-selector button { display: grid; grid-template-columns: 24px minmax(0, 1fr); grid-template-rows: auto auto; align-content: center; justify-content: start; gap: 2px 8px; min-height: 67px; padding: 11px 14px; border: 0; border-radius: 0; background: #101720; text-align: left; }
.accessory-selector button.active { background: #1a2a35; box-shadow: inset 0 -2px 0 var(--accent); }
.accessory-selector button > span { grid-row: 1 / 3; align-self: center; color: var(--accent); font: 10px var(--font-mono); }
.accessory-selector strong { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.accessory-selector small { color: var(--muted); font: 10px var(--font-mono); }
.accessory-stage { position: relative; min-height: 600px; overflow: hidden; border: 1px solid var(--border); border-top: 0; border-radius: 0 0 10px 10px; background: #0d141b; }
.accessory-stage :deep(.board-3d-viewer) { position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0; }
.accessory-detail { position: absolute; z-index: 5; top: 25px; bottom: 25px; width: 350px; display: flex; flex-direction: column; min-width: 0; padding: 30px 24px 20px; border: 1px solid rgba(85,214,255,.23); border-radius: 11px; background: linear-gradient(160deg, rgba(19,32,43,.97), rgba(10,17,24,.98) 75%); box-shadow: 0 20px 55px rgba(0,0,0,.35); backdrop-filter: blur(14px); }
.accessory-detail.side-right { right: 24px; }
.accessory-detail.side-left { left: 24px; }
.accessory-leader { position: absolute; z-index: 4; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.accessory-leader path { fill: none; stroke: var(--accent); stroke-width: 1.5; filter: drop-shadow(0 0 7px rgba(85,214,255,.72)); stroke-dasharray: 1; stroke-dashoffset: 1; animation: accessory-line-draw .8s ease forwards; }
.accessory-leader circle { fill: var(--accent); filter: drop-shadow(0 0 8px var(--accent)); }
.accessory-idle-caption { position: absolute; left: 50%; bottom: 24px; z-index: 4; transform: translateX(-50%); color: var(--secondary); font: 10px var(--font-mono); letter-spacing: .14em; white-space: nowrap; pointer-events: none; }
@keyframes accessory-line-draw { to { stroke-dashoffset: 0; } }
.accessory-detail-content { width: 100%; overflow-y: auto; min-height: 0; padding-right: 4px; }
.accessory-detail-top { display: flex; justify-content: space-between; color: var(--accent); font: 10px var(--font-mono); letter-spacing: .08em; }
.accessory-detail h2 { margin: 25px 0 10px; font-size: 24px; line-height: 1.16; letter-spacing: -.04em; }
.accessory-detail p { margin-bottom: 22px; color: var(--secondary); font-size: 12px; line-height: 1.65; }
.accessory-setting { display: grid; gap: 9px; margin: 18px 0 0; color: var(--text); font-size: 11px; }
.accessory-setting select { width: 100%; }
.accessory-switches { display: grid; gap: 8px; margin-top: 14px; }
.accessory-switches label { display: flex; align-items: center; justify-content: space-between; padding: 9px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; }
.accessory-switches input { width: 17px; height: 17px; min-height: 0; margin: 0; accent-color: var(--accent); }
.accessory-note { margin: 15px 0 0 !important; color: var(--muted) !important; font-size: 10px !important; }
.accessory-link { width: 100%; justify-content: space-between; margin-top: 22px; color: var(--accent); font-size: 11px; }
.accessory-detail-footer { display: flex; justify-content: space-between; margin-top: auto; padding-top: 25px; color: var(--muted); font: 9px var(--font-mono); letter-spacing: .08em; }
.accessory-detail-footer strong { color: var(--secondary); font-weight: 500; }
.accessory-panel-enter-active, .accessory-panel-leave-active { transition: opacity .45s ease, transform .55s cubic-bezier(.2,.8,.2,1); }
.accessory-panel-enter-from, .accessory-panel-leave-to { opacity: 0; }
.accessory-panel-enter-from.side-right, .accessory-panel-leave-to.side-right { transform: translateX(35px); }
.accessory-panel-enter-from.side-left, .accessory-panel-leave-to.side-left { transform: translateX(-35px); }
@media (max-width: 900px) { .accessory-stage { min-height: 0; display: flex; flex-direction: column; } .accessory-stage :deep(.board-3d-viewer) { position: relative; inset: auto; height: 440px; flex: none; } .accessory-detail { position: relative; top: auto; bottom: auto; left: auto !important; right: auto !important; width: auto; min-height: 270px; margin: 0 14px 14px; } .accessory-leader { display: none; } .accessory-selector button { padding-inline: 8px; } .accessory-idle-caption { top: 412px; bottom: auto; } }
@media (max-width: 650px) { .accessory-header { align-items: start; flex-direction: column; padding-block: 20px; } .accessory-selector { grid-template-columns: repeat(5, minmax(112px, 1fr)); overflow-x: auto; } .accessory-selector button { min-height: 58px; } .accessory-detail { padding: 22px 18px; } .accessory-idle-caption { font-size: 8px; } }
@media (prefers-reduced-motion: reduce) { .accessory-panel-enter-active, .accessory-panel-leave-active { transition: none; } .accessory-leader path { animation: none; stroke-dashoffset: 0; } }
</style>

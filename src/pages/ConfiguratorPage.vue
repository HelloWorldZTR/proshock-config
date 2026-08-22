<template>
  <div class="page configurator-page">
    <nav class="subtabs" aria-label="Configurator sections">
      <button v-for="item in tabs" :key="item.id" :class="{ active: section === item.id }" @click="$emit('section', item.id)">
        {{ item.label }}
      </button>
    </nav>
    <div v-if="section !== 'buttons'" class="context-row">
      <span>Slot {{ selectedProfile + 1 }}</span><b>·</b><span>{{ stateLabel }}</span>
    </div>
    <div v-if="section === 'general'" class="editor-canvas">
      <section class="form-section">
        <header><h1>General</h1><p>Core settings stored by the current firmware.</p></header>
        <label><span>Poll rate</span>
          <select :value="pollrateHz" @change="$emit('pollrate', $event.target.value)">
            <option v-for="rate in [512,1000,2000,4000,8000]" :key="rate" :value="rate">{{ rate === 1000 ? "1 kHz" : rate >= 1000 ? `${rate / 1000} kHz` : `${rate} Hz` }}</option>
          </select>
        </label>
        <label><span>Boot profile</span>
          <select :value="bootProfile" @change="$emit('boot-profile', Number($event.target.value))">
            <option v-for="index in 4" :key="index" :value="index - 1">Slot {{ index }}</option>
          </select>
        </label>
      </section>
      <div class="compact-status">Live input · {{ snapshot?.adc_running ? "ADC running" : "Waiting for device" }}</div>
    </div>
    <div v-else-if="section === 'sticks' || section === 'triggers'" class="editor-split">
      <div class="curve-stack">
        <header class="page-heading">
          <h1>{{ section === "sticks" ? "Stick response" : "Trigger response" }}</h1>
          <p>{{ section === "sticks" ? "Each stick uses one radial response curve, not separate X/Y curves." : "Set the relationship between trigger travel and output to change the trigger feel." }}</p>
        </header>
        <div class="curve-editor-grid">
          <CurveEditor
            v-for="(response, index) in responses"
            :key="index"
            :label="responseLabels[index]"
            :model-value="response"
            :baseline-value="baselineResponses?.[index]"
            @update:model-value="$emit('response', { kind: section, index, value: $event })"
          />
        </div>
        <div class="button-row">
          <button type="button" @click="$emit('reset-curves', section)">Reset curves</button>
          <button type="button" @click="$emit('copy-curve', section)">Copy first to second</button>
          <button v-if="section === 'sticks'" type="button" @click="$emit('calibrate')">Run Quick Calibration</button>
        </div>
      </div>
      <InputViewer
        :raw="raw"
        :snapshot="snapshot"
        :calibration="calibration"
        :axis-invert="configInfo?.axis_invert"
        :detail-kind="section === 'sticks' ? 'sticks' : 'triggers'"
        mode="compact"
        title="Live preview"
        source-label="Firmware processed input"
      />
    </div>
    <RCFilterEditor
      v-else-if="section === 'rc'"
      :profile="profile"
      :raw="raw"
      :snapshot="snapshot"
      :calibration="calibration"
      :axis-invert="configInfo?.axis_invert"
      @update="$emit('stick-rc', $event)"
    />
    <ResolverEditor
      v-else-if="section === 'buttons'"
      :resolver="profile?.resolver"
      :raw="raw"
      :connected="connected"
      :read-digital-input="readDigitalInput"
      @update="$emit('resolver', $event)"
    />
    <section v-else-if="section === 'lighting'" class="form-section lighting-section">
      <header>
        <h1>Profile lighting</h1>
        <p>Each Profile stores its own RGB color. The active Profile drives the controller light immediately after Apply.</p>
      </header>
      <div class="lighting-editor">
        <div class="lighting-preview" :style="{ '--profile-led-color': profileHex }">
          <div class="lighting-preview-bar"><i></i></div>
          <span>Slot {{ selectedProfile + 1 }}</span>
          <strong>{{ profileHex.toUpperCase() }}</strong>
          <small>RGB {{ profileRgb.join(" · ") }}</small>
        </div>
        <div class="lighting-controls">
          <label class="lighting-color-field">
            <span>
              Profile LED color
              <small>Direct 8-bit RGB output</small>
            </span>
            <input
              type="color"
              :value="profileHex"
              aria-label="Profile LED color"
              @input="$emit('profile-color', $event.target.value)"
            >
          </label>
          <div class="lighting-swatches" aria-label="Profile LED color presets">
            <button
              v-for="swatch in lightingSwatches"
              :key="swatch"
              type="button"
              :class="{ active: profileHex.toLowerCase() === swatch }"
              :style="{ '--swatch-color': swatch }"
              :title="swatch.toUpperCase()"
              :aria-label="`Set profile LED color to ${swatch}`"
              @click="$emit('profile-color', swatch)"
            ><i></i></button>
          </div>
          <div class="support-note lighting-enabled-note">
            Apply updates firmware RAM. Save persists the color to flash. Switching Profiles automatically recalls their stored colors.
          </div>
        </div>
      </div>
    </section>
    <div v-else class="advanced-canvas">
      <header class="page-heading">
        <h1>Advanced</h1>
        <p>Fine-tune the current Profile's stick shape and raw input bounds.</p>
      </header>
      <StickRoundnessEditor
        :profile="profile"
        @update="$emit('stick-shape', $event)"
      />
      <section class="advanced-bounds-section">
        <header>
          <h2>Stick and trigger raw bounds</h2>
          <p>Edit the device-level ADC endpoints. Stick centers remain owned by calibration.</p>
        </header>
        <div class="advanced-bounds-grid">
          <article v-for="(axis, index) in calibration?.axis || []" :key="axis.name">
            <header><strong>{{ axis.name }}</strong><span>Center {{ axis.raw_center }}</span></header>
            <label><span>Lower bound</span>
              <input type="number" min="0" max="4095" :value="axis.raw_min"
                @change="$emit('calibration-bound', { kind: 'axis', index, field: 'raw_min', value: $event.target.value })">
            </label>
            <label><span>Upper bound</span>
              <input type="number" min="0" max="4095" :value="axis.raw_max"
                @change="$emit('calibration-bound', { kind: 'axis', index, field: 'raw_max', value: $event.target.value })">
            </label>
          </article>
          <article v-for="(trigger, index) in calibration?.trigger || []" :key="trigger.name">
            <header><strong>{{ trigger.name }}</strong><span>Trigger</span></header>
            <label><span>Lower bound</span>
              <input type="number" min="0" max="4095" :value="trigger.raw_released"
                @change="$emit('calibration-bound', { kind: 'trigger', index, field: 'raw_released', value: $event.target.value })">
            </label>
            <label><span>Upper bound</span>
              <input type="number" min="0" max="4095" :value="trigger.raw_pressed"
                @change="$emit('calibration-bound', { kind: 'trigger', index, field: 'raw_pressed', value: $event.target.value })">
            </label>
          </article>
        </div>
        <p class="support-note">Stick bounds must remain at least 128 ADC counts away from the calibrated center. Trigger lower bounds must remain below upper bounds. Apply updates RAM; Save is required before switching slots.</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import CurveEditor from "../CurveEditor.vue";
import InputViewer from "../components/InputViewer.vue";
import RCFilterEditor from "../components/RCFilterEditor.vue";
import ResolverEditor from "../components/ResolverEditor.vue";
import StickRoundnessEditor from "../components/StickRoundnessEditor.vue";

const props = defineProps({
  section: String, selectedProfile: Number, stateLabel: String, profile: Object,
  baselineProfile: Object, pollrateHz: String, bootProfile: Number, raw: Object,
  snapshot: Object, calibration: Object, configInfo: Object,
  connected: Boolean, readDigitalInput: Function,
});
defineEmits(["section", "profile-color", "pollrate", "boot-profile", "response", "resolver", "stick-shape", "stick-rc", "calibration-bound", "reset-curves", "copy-curve", "calibrate"]);
const tabs = [
  { id: "general", label: "General" }, { id: "sticks", label: "Sticks" },
  { id: "triggers", label: "Triggers" }, { id: "rc", label: "RC" },
  { id: "buttons", label: "Buttons" },
  { id: "lighting", label: "Lighting" }, { id: "advanced", label: "Advanced" },
];
const profileRgb = computed(() => props.profile?.color_rgb || [48, 128, 255]);
const profileHex = computed(() => `#${profileRgb.value.map((v) => v.toString(16).padStart(2, "0")).join("")}`);
const lightingSwatches = [
  "#3080ff", "#55d6ff", "#7c72ff", "#ff4f87",
  "#ff3b30", "#ffb020", "#52e3a4", "#ffffff",
];
const responses = computed(() => props.section === "sticks" ? props.profile?.stick_response || [] : props.profile?.trigger_response || []);
const baselineResponses = computed(() => props.section === "sticks" ? props.baselineProfile?.stick_response : props.baselineProfile?.trigger_response);
const responseLabels = computed(() => props.section === "sticks" ? ["Left stick radial response", "Right stick radial response"] : ["L2 response", "R2 response"]);
</script>

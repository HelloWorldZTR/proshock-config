<template>
  <div class="page configurator-page">
    <nav class="subtabs" aria-label="Configurator sections">
      <button v-for="item in tabs" :key="item.id" :class="{ active: section === item.id }" @click="$emit('section', item.id)">
        {{ item.label }}
      </button>
    </nav>
    <div class="context-row">
      <span>Slot {{ selectedProfile + 1 }}</span><b>·</b><span>{{ stateLabel }}</span>
    </div>
    <div class="configurator-content" :data-section="section">
    <div v-if="section === 'system' || section === 'general'" class="system-settings">
      <header class="page-heading"><h1>System</h1><p>Profile input timing and device startup settings.</p></header>
      <section class="system-group"><h2>Current Profile</h2>
        <label class="system-pollrate"><span>Poll rate</span><select :value="pollrateHz" @change="$emit('pollrate', $event.target.value)"><option v-for="rate in [512,1000,2000,4000,8000]" :key="rate" :value="rate">{{ rate >= 1000 ? `${rate / 1000} kHz` : `${rate} Hz` }}</option></select></label>
        <ButtonDebounceControl :model-value="profile?.button_debounce_samples" @update:model-value="$emit('button-debounce', $event)" @validity="$emit('debounce-validity', $event)" />
      </section>
      <section class="system-group"><h2>Device settings</h2><label class="system-pollrate"><span>Boot profile</span><select :value="bootProfile" @change="$emit('boot-profile', Number($event.target.value))"><option v-for="index in 4" :key="index" :value="index - 1">Slot {{ index }}</option></select></label></section>
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
          <button v-if="section === 'sticks'" type="button" @click="$emit('calibrate')">Run Analog Calibration</button>
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
    <div v-else-if="section === 'buttons'" class="button-config-stack">
      <ResolverEditor
        :resolver="profile?.resolver"
        :raw="raw"
        :connected="connected"
        :read-digital-input="readDigitalInput"
        @update="$emit('resolver', $event)"
      />
    </div>
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
      <StickRoundnessEditor
        :profile="profile"
        :snapshot="snapshot"
        :can-test="canTest"
        @update="$emit('stick-shape', $event)"
      />
    </div>
    <SettingsApplyFooter :state="applyState" :state-label="stateLabel" @apply="$emit('apply')" />
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
import ButtonDebounceControl from "../components/ButtonDebounceControl.vue";
import SettingsApplyFooter from "../components/SettingsApplyFooter.vue";

const props = defineProps({
  section: String, selectedProfile: Number, stateLabel: String, profile: Object,
  baselineProfile: Object, pollrateHz: String, bootProfile: Number, raw: Object,
  snapshot: Object, calibration: Object, configInfo: Object,
  connected: Boolean, readDigitalInput: Function, applyState: Object, canTest: Boolean,
});
defineEmits(["section", "profile-color", "pollrate", "boot-profile", "response", "resolver", "button-debounce", "stick-shape", "stick-rc", "debounce-validity", "reset-curves", "copy-curve", "calibrate", "apply"]);
const tabs = [
  { id: "system", label: "System" }, { id: "sticks", label: "Sticks" },
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

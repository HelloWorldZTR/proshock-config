<template>
  <div class="page home-page">
    <ProfileStrip
      :profiles="profiles"
      :active="configInfo?.active_profile"
      :boot="configInfo?.boot_profile"
      :selected="selectedProfile"
      :disabled="!connected || busy || profileSwitchBlocked"
      @select="$emit('switch-profile', $event)"
      @edit="$emit('edit-profile', $event)"
    />
    <div v-if="!connected" class="empty-state">
      <div class="home-controller-icon" aria-hidden="true" v-html="controllerIcon"></div>
      <h1>Connect your ProShock controller</h1>
      <p>Connect directly to the controller's always-available WebHID interface. The game controller stays enumerated while you edit.</p>
      <button type="button" class="primary" :disabled="busy" @click="$emit('connect')">Connect device</button>
    </div>
    <div v-else class="home-stage">
      <InputViewer
        :raw="raw"
        :snapshot="snapshot"
        :calibration="calibration"
        :axis-invert="configInfo?.axis_invert"
        mode="large"
      />
      <AxisTable :raw="raw" :snapshot="snapshot" />
    </div>
    <section class="telemetry-band">
      <div><span>Configured</span><strong>{{ configInfo?.pollrate_hz ? `${configInfo.pollrate_hz} Hz` : "—" }}</strong></div>
      <div><span>Effective rate</span><strong class="unsupported">Not supported by firmware</strong></div>
      <div><span>Stick precision</span><strong>4096</strong></div>
      <div><span>Config state</span><strong>{{ stateLabel }}</strong></div>
      <div><span>ADC</span><strong>{{ snapshot?.adc_running ? "Running" : "—" }}</strong></div>
    </section>
  </div>
</template>

<script setup>
import InputViewer from "../components/InputViewer.vue";
import AxisTable from "../components/AxisTable.vue";
import ProfileStrip from "../components/ProfileStrip.vue";
import controllerIconSource from "../assets/dualshock-4-layout.svg?raw";

const controllerIcon = controllerIconSource.replace(
  "<svg",
  '<svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet"',
);

defineProps({
  connected: Boolean, busy: Boolean, profileSwitchBlocked: Boolean,
  profiles: Array, configInfo: Object,
  selectedProfile: Number, raw: Object, snapshot: Object, calibration: Object,
  stateLabel: String,
});
defineEmits(["connect", "switch-profile", "edit-profile"]);
</script>

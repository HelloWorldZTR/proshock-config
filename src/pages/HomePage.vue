<template>
  <div class="page home-page">
    <ProfileStrip
      :profiles="profiles"
      :active="configInfo?.active_profile"
      :boot="configInfo?.boot_profile"
      :selected="selectedProfile"
      :disabled="!connected || busy"
      @select="$emit('switch-profile', $event)"
      @edit="$emit('edit-profile', $event)"
    />
    <div v-if="!connected" class="empty-state">
      <div class="home-controller-icon" aria-hidden="true" v-html="controllerIcon"></div>
      <h1>Connect your ProShock controller</h1>
      <p>Connecting temporarily switches the controller from Gaming Mode to Configuration Mode and reconnects USB. Keep this tab open while editing.</p>
      <button type="button" class="primary" :disabled="busy" @click="$emit('connect')">Connect device</button>
    </div>
    <div v-else class="home-stage">
      <InputViewer
        :raw="raw"
        :snapshot="snapshot"
        :calibration="calibration"
        mode="large"
      />
      <AxisTable :raw="raw" :snapshot="snapshot" />
    </div>
    <section class="telemetry-band">
      <div><span>Configured</span><strong>{{ configInfo?.pollrate_hz ? `${configInfo.pollrate_hz} Hz` : "—" }}</strong></div>
      <div><span>Effective rate</span><strong class="unsupported">Not supported by firmware</strong></div>
      <div><span>Viewer refresh</span><strong>{{ connected ? "20 Hz" : "—" }}</strong></div>
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
  connected: Boolean, busy: Boolean, profiles: Array, configInfo: Object,
  selectedProfile: Number, raw: Object, snapshot: Object, calibration: Object,
  stateLabel: String,
});
defineEmits(["connect", "switch-profile", "edit-profile"]);
</script>

<template>
  <div class="page diagnostics-page">
    <nav class="subtabs" aria-label="Diagnostic sections">
      <button v-for="item in tabs" :key="item.id" :class="{ active: section === item.id }" @click="$emit('section', item.id)">{{ item.label }}</button>
    </nav>
    <div v-if="section === 'input'" class="diagnostic-input">
      <InputViewer :raw="raw" :snapshot="snapshot" :calibration="calibration" mode="diagnostic" title="Input monitor" />
      <AxisTable :raw="raw" :snapshot="snapshot" />
    </div>
    <section v-else-if="section === 'poll'" class="form-section">
      <header><h1>Poll rate monitor</h1><p>Configured, effective and viewer rates are deliberately kept separate.</p></header>
      <dl class="data-list">
        <div><dt>Configured report rate</dt><dd>{{ configInfo?.pollrate_hz ? `${configInfo.pollrate_hz} Hz` : "—" }}</dd></div>
        <div><dt>Viewer refresh</dt><dd>{{ connected ? "20 Hz" : "—" }}</dd></div>
        <div><dt>Effective / jitter / skipped</dt><dd class="unsupported">Not supported by firmware</dd></div>
      </dl>
    </section>
    <section v-else-if="section === 'device'" class="form-section">
      <header><h1>Device information</h1><p>Only values exposed by WebHID or the current config protocol are shown.</p></header>
      <dl class="data-list">
        <div><dt>Device</dt><dd>{{ deviceLabel }}</dd></div>
        <div><dt>Schema / profile / calibration</dt><dd>{{ configInfo?.schema_version ?? "—" }} / {{ profile?.profile_version ?? "—" }} / {{ calibration?.calibration_version ?? "—" }}</dd></div>
        <div><dt>Firmware build / board / USB speed</dt><dd class="unsupported">Not supported by firmware</dd></div>
      </dl>
    </section>
    <section v-else-if="section === 'storage'" class="form-section">
      <header><h1>Config storage</h1><p>RAM and flash state reported by the firmware.</p></header>
      <dl class="data-list">
        <div><dt>RAM dirty</dt><dd>{{ configInfo?.dirty ? "Yes" : "No" }}</dd></div>
        <div><dt>Save requested / active</dt><dd>{{ configInfo?.save_requested ?? "—" }} / {{ configInfo?.save_active ?? "—" }}</dd></div>
        <div><dt>Active flash slot / sequence</dt><dd>{{ configInfo?.active_slot ?? "—" }} / {{ configInfo?.sequence ?? "—" }}</dd></div>
        <div><dt>Load / validation / save</dt><dd>{{ configInfo?.load_status ?? "—" }} / {{ configInfo?.validation_status ?? "—" }} / {{ configInfo?.save_status ?? "—" }}</dd></div>
      </dl>
    </section>
    <section v-else class="form-section">
      <header class="section-heading"><div><h1>Event log</h1><p>Structured browser-side command and session events.</p></div><button type="button" @click="$emit('export-log')">Export diagnostic bundle</button></header>
      <div class="event-log"><div v-for="(entry, index) in logs" :key="index"><time>{{ entry.timestamp }}</time><b>{{ entry.severity }}</b><span>{{ entry.detail }}</span></div></div>
    </section>
  </div>
</template>

<script setup>
import AxisTable from "../components/AxisTable.vue";
import InputViewer from "../components/InputViewer.vue";
defineProps({
  section: String, raw: Object, snapshot: Object, calibration: Object, configInfo: Object,
  profile: Object, connected: Boolean, deviceLabel: String, logs: Array,
});
defineEmits(["section", "export-log"]);
const tabs = [
  { id: "input", label: "Input Monitor" }, { id: "poll", label: "Poll Rate" },
  { id: "device", label: "Device Info" }, { id: "storage", label: "Config Storage" },
  { id: "log", label: "Event Log" },
];
</script>

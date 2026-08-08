<template>
  <main class="app-shell">
    <div v-if="showSecureNote" class="secure-warning">WebHID requires HTTPS or localhost.</div>
    <AppHeader
      :profiles="profileCards"
      :active="configInfo?.active_profile ?? selectedProfile"
      :boot="configInfo?.boot_profile ?? bootProfile"
      :selected="selectedProfile"
      :profile-draft-changed="profileChanged"
      :connected="connected"
      :busy="busy || iapMode"
      :disconnecting="disconnecting"
      :current-page="iapMode ? 'firmware' : page"
      :state="headerState"
      :iap-active="iapMode"
      @navigate="requestPageNavigation"
      @profile-select="requestProfileSwitch"
      @primary-action="handleHeaderAction"
      @disconnect="requestDisconnect"
      @refresh="requestRefresh"
      @import-profile="chooseProfileImport"
      @export-profile="downloadProfile"
      @export-backup="downloadBackup"
      @device-info="requestGo('diagnostics', 'device')"
      @factory-reset="requestGo('firmware')"
    />
    <HomePage
      v-if="page === 'home' && !iapMode"
      :connected="connected" :busy="busy" :profiles="profileCards" :config-info="configInfo"
      :selected-profile="selectedProfile" :raw="latestRaw" :snapshot="liveInputSnapshot"
      :calibration="calibrationDraft || defaultCalibration" :state-label="stateLabel"
      @connect="connectFlow" @switch-profile="requestProfileSwitch" @edit-profile="requestEditProfile"
    />
    <ConfiguratorPage
      v-else-if="page === 'configurator' && !iapMode"
      :section="configuratorSection" :selected-profile="selectedProfile" :state-label="stateLabel"
      :profile="profileDraft" :baseline-profile="profileBackup" :pollrate-hz="pollrateHz"
      :boot-profile="bootProfile" :raw="latestRaw" :snapshot="liveInputSnapshot"
      :calibration="calibrationDraft || defaultCalibration" :config-info="configInfo"
      :connected="connected" :read-digital-input="getDigitalInput"
      @section="requestGo('configurator', $event)" @profile-color="setProfileColor"
      @pollrate="pollrateHz = $event" @boot-profile="bootProfile = $event"
      @response="setResponse" @resolver="setResolver" @stick-shape="setStickShape"
      @reset-curves="resetCurves" @copy-curve="copyCurve"
      @calibrate="requestGo('calibration')"
    />
    <QuickCalibrationPage
      v-else-if="page === 'calibration' && !iapMode"
      :step="wizardStep" :busy="busy" :error="wizardError" :neutral-result="neutralResult"
      :center-capture-active="centerCaptureActive" :center-capture-status="centerCaptureStatus"
      :left-range="rangeCaptureActive ? { sectorCounts: rangePreview.leftSectorCounts } : leftRange"
      :right-range="rangeCaptureActive ? { sectorCounts: rangePreview.rightSectorCounts } : rightRange"
      :trigger-capture-active="triggerCaptureActive" :trigger-window-count="triggerPressWindows.length"
      :calibration-valid="calibrationValidation.pass"
      :checks="calibrationChecks"
      @primary="wizardPrimary" @back="wizardBack" @cancel="cancelWizard"
    />
    <FirmwareUpgradePage
      v-else-if="page === 'firmware' || iapMode"
      :config-client="client"
      :config-connected="connected"
      :configuration-dirty="hasUnsaved"
      @iap-session="handleIapSession"
    />
    <DiagnosticsPage
      v-else
      :section="diagnosticsSection" :raw="latestRaw" :snapshot="liveInputSnapshot"
      :calibration="calibrationDraft || defaultCalibration" :config-info="configInfo"
      :profile="profileDraft" :connected="connected" :device-label="deviceLabel" :logs="logs"
      @section="requestGo('diagnostics', $event)" @export-log="downloadDiagnostics"
    />
    <UnsavedChangesDialog
      v-if="leaveGuardOpen"
      :kind="leaveGuardKind"
      :busy="leaveGuardBusy"
      :can-apply="canApply"
      :can-save="canSave"
      :can-discard="canDiscardAndLeave"
      :discard-reason="discardReason"
      :error="leaveGuardError"
      :connection-exit="leaveGuardIsDisconnect"
      @stay="closeLeaveGuard"
      @apply="applyFromLeaveGuard"
      @save="saveFromLeaveGuard"
      @discard="discardFromLeaveGuard"
      @keep-ram="keepRamFromLeaveGuard"
    />
    <input ref="profileFileInput" class="visually-hidden" type="file" accept=".json,.proshock-profile.json" @change="importProfileFile">
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  HEADER_ACTION,
  LEAVE_GUARD_KIND,
  deriveHeaderState,
  deriveLeaveGuardKind,
  shouldGuardNavigation,
} from "./app-shell-state.js";
import AppHeader from "./components/AppHeader.vue";
import UnsavedChangesDialog from "./components/UnsavedChangesDialog.vue";
import HomePage from "./pages/HomePage.vue";
import ConfiguratorPage from "./pages/ConfiguratorPage.vue";
import QuickCalibrationPage from "./pages/QuickCalibrationPage.vue";
import FirmwareUpgradePage from "./pages/FirmwareUpgradePage.vue";
import DiagnosticsPage from "./pages/DiagnosticsPage.vue";
import { cloneConfigData } from "./clone-data.js";
import {
  exportBackup,
  exportProfile,
  importProfile as parseImportedProfile,
} from "./services/import-export.js";
import { CommandScheduler } from "./services/command-scheduler.js";
import { createLiveInputSnapshot } from "./live-input.js";
import { validateResolver } from "./resolver-schema.js";
import {
  consumeCalibrationConfirmEdge,
  createCalibrationConfirmLatch,
} from "./calibration-controls.js";
import {
  ANALOG_CALIBRATION_SIZE,
  ANALOG_CALIBRATION_VERSION,
  COMMAND,
  CONFIG_STATUS_NAME,
  PROFILE_CHUNK_DATA_SIZE,
  PROFILE_COUNT,
  PROFILE_SIZE,
  PROFILE_VERSION,
  STATUS_NAME,
  createDefaultAnalogCalibration,
  createLinearResponse,
  digitalMaskFromRawInput,
  makeBeginProfilePayload,
  makeGlobalConfigPayload,
  makeProfileChunkRequest,
  makeProfileChunkWrite,
  makeSwitchProfilePayload,
  makeVersionPayload,
  parseAnalogCalibration,
  parseAnalogSnapshot,
  parseConfigInfo,
  parseDs4InputReport,
  parseDigitalInput,
  parseProfile,
  parseProfileChunk,
  parseRawInput,
  parseStatus,
  writeAnalogCalibrationToPayload,
  writeProfileDraftToPayload,
} from "./protocol.js";
import {
  CENTER_RETURN_DIRECTIONS,
  CENTER_RETURN_SAMPLE_COUNT,
  RANGE_SAMPLE_LIMIT,
  RAW_POLL_MS,
  analyzeCenterReturns,
  analyzeStickRange,
  analyzeTriggers,
  buildCalibrationDraft,
  createCenterReturnCapture,
  createTriggerCycleCapture,
  dedupeSnapshots,
  estimateStickCoverage,
  nextWizardStep,
  recordCenterReturnSample,
  recordTriggerCycleSample,
  validateCalibration,
  validateResponse,
} from "./calibration.js";
import { WebHidClient } from "./webhid-client.js";

const client = new WebHidClient();
const scheduler = new CommandScheduler();
const showSecureNote = !window.isSecureContext || location.protocol === "file:";
const connected = ref(false);
const busy = ref(false);
const saveInProgress = ref(false);
const disconnecting = ref(false);
const iapMode = ref(false);
const deviceLabel = ref("Disconnected");
const configInfo = ref(null);
const lastStatus = ref(null);
const selectedProfile = ref(0);
const pollrateHz = ref("1000");
const bootProfile = ref(0);
const profileDraft = ref(null);
const calibrationDraft = ref(null);
const profileBackup = ref(null);
const calibrationBackup = ref(null);
const latestRaw = ref(null);
const analogSnapshot = ref(null);
const wizardStep = ref("neutral");
const wizardError = ref("");
const neutralResult = ref(null);
const centerCaptureActive = ref(false);
const centerCaptureStatus = ref({
  phase: "idle",
  direction: CENTER_RETURN_DIRECTIONS[0],
  completed: 0,
  readySamples: 0,
  insufficientSamples: false,
});
const leftRange = ref(null);
const rightRange = ref(null);
const rangeCaptureActive = ref(false);
const triggerCaptureActive = ref(false);
const rangeSamples = ref([]);
const rangePreview = ref({
  leftSectorCounts: Array(16).fill(0),
  rightSectorCounts: Array(16).fill(0),
});
const releasedSamples = ref([]);
const triggerPressWindows = ref([]);
const logs = ref([{ timestamp: new Date().toISOString(), severity: "info", detail: "Ready." }]);
const allProfiles = ref([]);
const page = ref("home");
const configuratorSection = ref("general");
const diagnosticsSection = ref("input");
const toast = ref("");
const profileFileInput = ref(null);
const calibrationProfileGuard = ref(null);
const savedProfileBaseline = ref(null);
const savedCalibrationBaseline = ref(null);
const savedGlobalBaseline = ref(null);
const appliedChangeKinds = ref({
  profile: false,
  calibration: false,
  global: false,
});
const savedBaselineAvailable = ref(false);
const leaveGuardOpen = ref(false);
const leaveGuardBusy = ref(false);
const leaveGuardError = ref("");
const leaveGuardIsDisconnect = ref(false);
const leaveGuardReturnFocus = ref(null);
const defaultCalibration = createDefaultAnalogCalibration();
const rawNames = ["LX", "LY", "RX", "RY", "L2", "R2"];
const profileColors = ["#3080ff", "#30d158", "#ffb020", "#c05aff"];
let rangeTimer = null;
let centerTimer = null;
let centerReturnCapture = null;
let triggerTimer = null;
let triggerCycleCapture = null;
let gamepadInputDevice = null;
let gamepadInputSequence = 0;
let pendingGamepadInput = null;
let gamepadInputFrame = 0;
const calibrationConfirmLatch = createCalibrationConfirmLatch();
let calibrationConfirmActionActive = false;
let digitalInputCommandSupported = null;
let pendingNavigation = null;
let currentRouteHash = "";

/*
 * Processed values must come from one firmware-owned analog snapshot. Raw
 * capture remains a separate GET_RAW_INPUT stream for the calibration wizard.
 */
const liveInputSnapshot = computed(() => {
  return createLiveInputSnapshot(analogSnapshot.value);
});
const calibrationValidation = computed(() => (
  calibrationDraft.value
    ? validateCalibration(calibrationDraft.value)
    : { pass: false, failures: ["No calibration loaded."] }
));
const responseValid = computed(() => profileDraft.value
  && [...profileDraft.value.stick_response, ...profileDraft.value.trigger_response]
    .every(validateResponse));
const resolverValid = computed(() => (
  profileDraft.value?.resolver
    ? validateResolver(profileDraft.value.resolver).length === 0
    : false
));
const profileCards = computed(() => Array.from({ length: PROFILE_COUNT }, (_, index) => ({
  index,
  hex: (
    index === selectedProfile.value
      ? rgbToHex(profileDraft.value?.color_rgb)
      : null
  ) || rgbToHex(configInfo.value?.profiles[index]?.color_rgb) || profileColors[index],
})));
const navigation = [
  { id: "home", label: "Home" },
  { id: "configurator", label: "Configurator" },
  { id: "calibration", label: "Quick Calibration" },
  { id: "firmware", label: "Firmware Upgrade" },
  { id: "diagnostics", label: "Diagnostics" },
];
const profileChanged = computed(() => (
  profileDraft.value && profileBackup.value
    ? JSON.stringify(profileDraft.value) !== JSON.stringify(profileBackup.value)
    : false
));
const globalChanged = computed(() => !!configInfo.value && (
  String(configInfo.value.pollrate_hz) !== String(pollrateHz.value)
  || configInfo.value.boot_profile !== bootProfile.value
));
const calibrationChanged = computed(() => (
  calibrationDraft.value && calibrationBackup.value
    ? JSON.stringify(calibrationDraft.value) !== JSON.stringify(calibrationBackup.value)
    : false
));
const hasApplyDraft = computed(() => profileChanged.value || globalChanged.value);
const hasDraft = computed(() => profileChanged.value || globalChanged.value || calibrationChanged.value);
const applyValid = computed(() => responseValid.value && resolverValid.value);
const canApply = computed(() => (
  connected.value
  && !busy.value
  && hasApplyDraft.value
  && applyValid.value
));
const canSave = computed(() => connected.value && !busy.value && !!configInfo.value?.dirty && !hasDraft.value);
const calibrationWorkflowPending = computed(() => (
  page.value === "calibration"
  && [
    "sticks-range",
    "triggers-released",
    "triggers-pressed",
    "validate-calibration",
  ].includes(wizardStep.value)
));
const calibrationOwnsHeaderActions = computed(() => (
  page.value === "calibration"
  && (
    centerCaptureActive.value
    || !["neutral", "complete"].includes(wizardStep.value)
  )
));
const calibrationPendingForGuard = computed(() => (
  calibrationWorkflowPending.value
  || centerCaptureActive.value
  || centerCaptureStatus.value.completed > 0
  || calibrationChanged.value
));
const leaveGuardKind = computed(() => deriveLeaveGuardKind({
  hasApplyDraft: hasApplyDraft.value,
  calibrationPending: calibrationPendingForGuard.value,
  ramDirty: !!configInfo.value?.dirty,
}));
const hasUnsaved = computed(() => leaveGuardKind.value !== LEAVE_GUARD_KIND.NONE);
const headerState = computed(() => deriveHeaderState({
  connected: connected.value,
  busy: busy.value || iapMode.value,
  saving: saveInProgress.value,
  hasApplyDraft: hasApplyDraft.value,
  applyValid: applyValid.value,
  ramDirty: !!configInfo.value?.dirty,
  calibrationOwnsActions: calibrationOwnsHeaderActions.value,
  hasUnsaved: hasUnsaved.value,
}));
const appliedRollbackRequired = computed(() => (
  appliedChangeKinds.value.profile
  || appliedChangeKinds.value.calibration
  || appliedChangeKinds.value.global
));
const canDiscardAndLeave = computed(() => {
  if (
    leaveGuardKind.value === LEAVE_GUARD_KIND.APPLIED
    && !appliedRollbackRequired.value
  ) {
    return false;
  }
  return !appliedRollbackRequired.value
    || (connected.value && savedBaselineAvailable.value);
});
const discardReason = computed(() => {
  if (canDiscardAndLeave.value) {
    return "";
  }
  if (!connected.value) {
    return "Reconnect the controller before rolling back changes already applied to RAM.";
  }
  if (
    leaveGuardKind.value === LEAVE_GUARD_KIND.APPLIED
    && !appliedRollbackRequired.value
  ) {
    return "This RAM-dirty state existed before the current session; save it before leaving.";
  }
  return "This dirty RAM state existed before the current session, so no saved rollback baseline is available.";
});
const stateLabel = computed(() => {
  if (!connected.value) return hasUnsaved.value ? "Unsaved · device offline" : "Offline";
  if (busy.value) return "Working…";
  if (hasDraft.value) return "Draft changed";
  if (configInfo.value?.save_active) return "Saving";
  if (configInfo.value?.dirty) return "Applied in RAM";
  return "Saved";
});
const calibrationChecks = computed(() => {
  const checks = calibrationValidation.value.failures.map((detail) => ({
    pass: false,
    label: "Calibration payload",
    detail,
  }));
  if (!checks.length) {
    checks.push({
      pass: true,
      label: "Bounds and fixed directions",
      detail: "All four axes and both trigger spans match the fixed hardware semantics.",
    });
  }
  if (neutralResult.value) {
    neutralResult.value.axes.forEach((axis) => checks.push({
      pass: true,
      status: axis.warning ? "warning" : "pass",
      label: `${axis.name} neutral stability`,
      detail: `Returns ${axis.returnCenters?.join(" / ") || axis.center}; max window noise ${axis.noiseSpan.toFixed(1)} counts (warn > 32); direction spread ${axis.returnCenterSpan?.toFixed(1) || "0.0"} counts (warn > 64).`,
    }));
  }
  [leftRange.value, rightRange.value].filter(Boolean).forEach((range) => checks.push({
    pass: range.sectorCounts.every((count) => count >= 8),
    label: `${range.stickIndex ? "Right" : "Left"} stick outer coverage`,
    detail: `${range.sectorCounts.filter((count) => count >= 8).length}/16 sectors have at least 8 rim samples.`,
  }));
  return checks;
});
const statusText = computed(() => JSON.stringify({
  load: namedStatus(configInfo.value?.load_status),
  save: namedStatus(configInfo.value?.save_status),
  validation: namedStatus(configInfo.value?.validation_status),
  migration_warning: configInfo.value?.migration_warning ?? 0,
  sequence: configInfo.value?.sequence,
  active_profile: configInfo.value?.active_profile,
  boot_profile: configInfo.value?.boot_profile,
  dirty: configInfo.value?.dirty,
}, null, 2));

function namedStatus(value) {
  return value == null ? "-" : `${value} (${CONFIG_STATUS_NAME[value] || "UNKNOWN"})`;
}

function rgbToHex(rgb) {
  if (!rgb) {
    return null;
  }
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function clone(value) {
  return cloneConfigData(value);
}

function log(message) {
  logs.value = [{
    timestamp: new Date().toISOString(),
    severity: /error|failed|timeout/i.test(message) ? "error" : "info",
    detail: message,
  }, ...logs.value].slice(0, 100);
}

function notify(message) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 3000);
}

function routeHash(nextPage, section = null) {
  const nextConfiguratorSection = nextPage === "configurator"
    ? section || configuratorSection.value
    : "";
  const nextDiagnosticsSection = nextPage === "diagnostics"
    ? section || diagnosticsSection.value
    : "";
  const suffix = nextPage === "configurator"
    ? `/slot/${selectedProfile.value + 1}/${nextConfiguratorSection}`
    : nextPage === "diagnostics" ? `/${nextDiagnosticsSection}` : "";
  return `#/${nextPage}${suffix}`;
}

function performGo(nextPage, section = null) {
  page.value = nextPage;
  if (nextPage === "configurator" && section) configuratorSection.value = section;
  if (nextPage === "diagnostics" && section) diagnosticsSection.value = section;
  currentRouteHash = routeHash(nextPage, section);
  history.replaceState(null, "", currentRouteHash);
}

function parseRouteHash(hash) {
  const parts = hash.replace(/^#\//, "").split("/");
  const nextPage = navigation.some((item) => item.id === parts[0])
    ? parts[0]
    : "home";
  const route = {
    page: nextPage,
    section: null,
    profileIndex: selectedProfile.value,
  };
  if (nextPage === "configurator") {
    const slotPosition = parts.indexOf("slot");
    if (slotPosition >= 0 && parts[slotPosition + 1]) {
      route.profileIndex = Math.max(
        0,
        Math.min(3, Number(parts[slotPosition + 1]) - 1 || 0),
      );
    }
    route.section = parts.at(-1) || "general";
  }
  if (nextPage === "diagnostics") {
    route.section = parts[1] || "input";
  }
  return route;
}

async function performParsedRoute(route) {
  if (route.profileIndex !== selectedProfile.value) {
    if (connected.value) {
      if (!await switchProfile(route.profileIndex)) {
        return false;
      }
    } else {
      selectedProfile.value = route.profileIndex;
    }
  }
  performGo(route.page, route.section);
  return true;
}

function requestNavigation(action, {
  targetProfile = selectedProfile.value,
  destructive = false,
} = {}) {
  if (!shouldGuardNavigation({
    hasUnsaved: hasUnsaved.value,
    currentProfile: selectedProfile.value,
    targetProfile,
    destructive,
  })) {
    void action();
    return;
  }
  pendingNavigation = action;
  leaveGuardError.value = "";
  leaveGuardReturnFocus.value = document.activeElement;
  leaveGuardOpen.value = true;
}

function requestGo(nextPage, section = null) {
  const targetHash = routeHash(nextPage, section);
  if (targetHash === currentRouteHash) {
    return;
  }
  requestNavigation(() => performParsedRoute({
    page: nextPage,
    section,
    profileIndex: selectedProfile.value,
  }));
}

function requestPageNavigation(nextPage) {
  if (iapMode.value && nextPage !== "firmware") return;
  requestGo(nextPage);
}

function handleIapSession(active) {
  iapMode.value = active;
  if (active) {
    stopCenterTimer();
    stopRangeTimer();
    stopTriggerTimer();
    stopSessionTimers();
    connected.value = false;
    deviceLabel.value = "ProShock 4 IAP";
    performGo("firmware");
  } else {
    deviceLabel.value = "Disconnected";
  }
}

function handleHashChange() {
  const targetHash = location.hash;
  if (targetHash === currentRouteHash) {
    return;
  }
  const route = parseRouteHash(targetHash);
  history.replaceState(null, "", currentRouteHash || "#/home");
  requestNavigation(
    () => performParsedRoute(route),
    { targetProfile: route.profileIndex },
  );
}

function requestEditProfile(index) {
  if (index === selectedProfile.value) {
    performGo("configurator", "general");
    return;
  }
  requestNavigation(async () => {
    if (!await switchProfile(index)) {
      return;
    }
    performGo("configurator", "general");
  }, { targetProfile: index });
}

function setProfileColor(value) {
  const hex = value.replace("#", "");
  profileDraft.value.color_rgb = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function setResponse({ kind, index, value }) {
  const field = kind === "sticks" ? "stick_response" : "trigger_response";
  profileDraft.value[field][index] = value;
}

function setResolver(value) {
  if (profileDraft.value) {
    profileDraft.value.resolver = value;
  }
}

function setStickShape({ stickIndex, sector, scaleQ15 }) {
  const scales = profileDraft.value?.stick_shape?.[stickIndex]?.scale_q15;
  if (!scales || sector < 0 || sector >= scales.length) {
    return;
  }
  scales[sector] = scaleQ15;
}

function resetCurves(kind) {
  const field = kind === "sticks" ? "stick_response" : "trigger_response";
  profileDraft.value[field] = [createLinearResponse(), createLinearResponse()];
}

function copyCurve(kind) {
  const field = kind === "sticks" ? "stick_response" : "trigger_response";
  profileDraft.value[field][1] = clone(profileDraft.value[field][0]);
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadProfile() {
  if (!profileDraft.value) return;
  downloadJson(`proshock-slot-${selectedProfile.value + 1}.proshock-profile.json`, exportProfile(profileDraft.value));
  notify("Profile exported without physical calibration.");
}

async function loadAllProfiles() {
  if (!connected.value) return [];
  const profiles = [];
  for (let index = 0; index < PROFILE_COUNT; index += 1) profiles.push(await readProfile(index));
  allProfiles.value = profiles;
  return profiles;
}

async function downloadBackup() {
  try {
    const profiles = allProfiles.value.length === PROFILE_COUNT ? allProfiles.value : await loadAllProfiles();
    downloadJson("proshock-device.proshock-backup.json", exportBackup(configInfo.value, profiles, calibrationDraft.value));
    notify("Full device backup exported.");
  } catch (error) {
    log(error.message);
  }
}

function chooseProfileImport() {
  profileFileInput.value?.click();
}

async function importProfileFile(event) {
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    const envelope = JSON.parse(await file.text());
    const imported = parseImportedProfile(envelope, selectedProfile.value, profileDraft.value?.raw);
    const before = profileDraft.value;
    const diff = [
      `Color: ${rgbToHex(before?.color_rgb)} → ${rgbToHex(imported.color_rgb)}`,
      `Left stick inner deadzone: ${before?.stick_response[0].inner_deadzone_q15 ?? "—"} → ${imported.stick_response[0].inner_deadzone_q15}`,
      `Right stick inner deadzone: ${before?.stick_response[1].inner_deadzone_q15 ?? "—"} → ${imported.stick_response[1].inner_deadzone_q15}`,
      "Physical calibration: unchanged",
    ].join("\n");
    if (!window.confirm(`Import into Slot ${selectedProfile.value + 1} as a draft?\n\n${diff}`)) return;
    profileDraft.value = imported;
    notify(`Profile imported to Slot ${selectedProfile.value + 1} as a draft.`);
    performGo("configurator", "sticks");
  } catch (error) {
    log(error.message);
    notify(error.message);
  } finally {
    event.target.value = "";
  }
}

function downloadDiagnostics() {
  downloadJson("proshock-diagnostics.json", {
    exported_at: new Date().toISOString(),
    browser: { user_agent: navigator.userAgent, webhid: "hid" in navigator, secure_context: window.isSecureContext },
    device: { label: deviceLabel.value, connected: connected.value },
    config_metadata: configInfo.value,
    analog_calibration: calibrationDraft.value,
    active_profile: profileDraft.value,
    analog: analogSnapshot.value,
    events: logs.value,
    firmware_blocked: ["effective report telemetry", "jitter", "skip/coalesce", "firmware build", "board revision", "USB speed", "factory reset"],
  });
}

function expectOk(packet, operation) {
  if (packet.status !== 0) {
    throw new Error(`${operation}: ${STATUS_NAME[packet.status] || packet.status}`);
  }
}

async function command(commandId, payload = new Uint8Array(), showBusy = true) {
  if (showBusy) {
    busy.value = true;
  }
  try {
    const packet = await scheduler.enqueue(
      () => client.sendCommand(commandId, payload),
      showBusy ? 1 : 4,
    );
    expectOk(packet, `command 0x${commandId.toString(16)}`);
    return packet;
  } finally {
    if (showBusy) {
      busy.value = false;
    }
  }
}

async function readChunked(commandId, size, objectIndex = 0) {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += PROFILE_CHUNK_DATA_SIZE) {
    const length = Math.min(PROFILE_CHUNK_DATA_SIZE, size - offset);
    const packet = await command(
      commandId,
      makeProfileChunkRequest(objectIndex, offset, length),
    );
    const chunk = parseProfileChunk(packet.payload);
    if (chunk.profileIndex !== objectIndex || chunk.offset !== offset || chunk.length !== length) {
      throw new Error("Chunk metadata mismatch.");
    }
    bytes.set(chunk.data, offset);
  }
  return bytes;
}

async function readProfile(index) {
  return parseProfile(await readChunked(COMMAND.GET_PROFILE_CHUNK, PROFILE_SIZE, index), index);
}

async function readCalibration() {
  return parseAnalogCalibration(
    await readChunked(COMMAND.GET_ANALOG_CALIBRATION_CHUNK, ANALOG_CALIBRATION_SIZE),
  );
}

async function writeChunked(beginCommand, setCommand, commitCommand, bytes, beginPayload, objectIndex, commitPayload) {
  await command(beginCommand, beginPayload);
  for (let offset = 0; offset < bytes.length; offset += PROFILE_CHUNK_DATA_SIZE) {
    await command(
      setCommand,
      makeProfileChunkWrite(objectIndex, offset, bytes.slice(offset, offset + PROFILE_CHUNK_DATA_SIZE)),
    );
  }
  return command(commitCommand, commitPayload);
}

async function writeCalibrationValue(value) {
  const bytes = new Uint8Array(value.raw);
  writeAnalogCalibrationToPayload(bytes, value);
  const packet = await writeChunked(
    COMMAND.BEGIN_ANALOG_CALIBRATION_WRITE,
    COMMAND.SET_ANALOG_CALIBRATION_CHUNK,
    COMMAND.COMMIT_ANALOG_CALIBRATION_WRITE,
    bytes,
    makeVersionPayload(ANALOG_CALIBRATION_VERSION),
    0,
    new Uint8Array(),
  );
  configInfo.value = parseConfigInfo(packet.payload);
  return parseAnalogCalibration(bytes);
}

async function writeCalibration() {
  calibrationDraft.value = await writeCalibrationValue(calibrationDraft.value);
  calibrationBackup.value = clone(calibrationDraft.value);
  appliedChangeKinds.value = {
    ...appliedChangeKinds.value,
    calibration: true,
  };
}

async function writeProfileValue(value, profileIndex) {
  const bytes = new Uint8Array(value.raw);
  writeProfileDraftToPayload(bytes, value);
  const packet = await writeChunked(
    COMMAND.BEGIN_PROFILE_WRITE,
    COMMAND.SET_PROFILE_CHUNK,
    COMMAND.COMMIT_PROFILE_WRITE,
    bytes,
    makeBeginProfilePayload(profileIndex),
    profileIndex,
    new Uint8Array([profileIndex]),
  );
  configInfo.value = parseConfigInfo(packet.payload);
  return parseProfile(bytes, profileIndex);
}

async function writeProfile() {
  profileDraft.value = await writeProfileValue(
    profileDraft.value,
    selectedProfile.value,
  );
  profileBackup.value = clone(profileDraft.value);
  appliedChangeKinds.value = {
    ...appliedChangeKinds.value,
    profile: true,
  };
}

function captureSavedBaselines(available = true) {
  savedProfileBaseline.value = profileDraft.value
    ? clone(profileDraft.value)
    : null;
  savedCalibrationBaseline.value = calibrationDraft.value
    ? clone(calibrationDraft.value)
    : null;
  savedGlobalBaseline.value = configInfo.value
    ? {
        pollrate_hz: String(configInfo.value.pollrate_hz),
        boot_profile: configInfo.value.boot_profile,
        feature_flags: configInfo.value.feature_flags,
      }
    : null;
  savedBaselineAvailable.value = available;
  appliedChangeKinds.value = {
    profile: false,
    calibration: false,
    global: false,
  };
}

async function connectFlow() {
  try {
    busy.value = true;
    const device = await client.connect();
    if (!device) {
      return;
    }
    digitalInputCommandSupported = null;
    connected.value = true;
    deviceLabel.value = `${device.productName || "ProShock 4"} · WebHID`;
    if (hasUnsaved.value && configInfo.value) {
      notify("Controller reconnected. Unsaved work was preserved.");
    } else {
      await refreshAll();
    }
    startSnapshotPolling();
  } catch (error) {
    stopSessionTimers();
    connected.value = false;
    log(error.message);
    notify(error.message);
  } finally {
    busy.value = false;
  }
}

function stopSessionTimers() {
  if (gamepadInputDevice) {
    gamepadInputDevice.removeEventListener("inputreport", handleGamepadInputReport);
    gamepadInputDevice = null;
  }
  if (gamepadInputFrame) {
    window.cancelAnimationFrame(gamepadInputFrame);
    gamepadInputFrame = 0;
  }
  pendingGamepadInput = null;
}

async function disconnectDevice() {
  if (!connected.value || disconnecting.value) return;
  disconnecting.value = true;
  stopSessionTimers();
  try {
    await client.close();
    notify("WebHID disconnected. The game controller remains available.");
  } catch (error) {
    log(error.message);
    notify(error.message);
  } finally {
    connected.value = false;
    deviceLabel.value = "Disconnected";
    disconnecting.value = false;
  }
}

function requestDisconnect() {
  if (!hasUnsaved.value) {
    void disconnectDevice();
    return;
  }
  pendingNavigation = disconnectDevice;
  leaveGuardIsDisconnect.value = true;
  leaveGuardError.value = "";
  leaveGuardReturnFocus.value = document.activeElement;
  leaveGuardOpen.value = true;
}

async function refreshAll() {
  try {
    const infoPacket = await command(COMMAND.GET_CONFIG_INFO);
    configInfo.value = parseConfigInfo(infoPacket.payload);
    const statusPacket = await command(COMMAND.GET_STATUS);
    lastStatus.value = parseStatus(statusPacket.payload);
    selectedProfile.value = configInfo.value.active_profile;
    pollrateHz.value = String(configInfo.value.pollrate_hz);
    bootProfile.value = configInfo.value.boot_profile;
    profileDraft.value = await readProfile(selectedProfile.value);
    calibrationDraft.value = await readCalibration();
    profileBackup.value = clone(profileDraft.value);
    calibrationBackup.value = clone(calibrationDraft.value);
    captureSavedBaselines(!configInfo.value.dirty);
    allProfiles.value = [];
    wizardStep.value = "neutral";
    wizardError.value = "";
    performGo(page.value, page.value === "configurator"
      ? configuratorSection.value
      : page.value === "diagnostics" ? diagnosticsSection.value : null);
    return true;
  } catch (error) {
    log(error.message);
    notify(error.message);
    return false;
  }
}

async function switchProfile(index) {
  try {
    const packet = await command(COMMAND.SWITCH_PROFILE, makeSwitchProfilePayload(index));
    configInfo.value = parseConfigInfo(packet.payload);
    selectedProfile.value = index;
    profileDraft.value = await readProfile(index);
    profileBackup.value = clone(profileDraft.value);
    if (!configInfo.value?.dirty) {
      savedProfileBaseline.value = clone(profileDraft.value);
      savedBaselineAvailable.value = true;
    }
    return true;
  } catch (error) {
    log(error.message);
    notify(error.message);
    return false;
  }
}

function requestProfileSwitch(index) {
  if (index === selectedProfile.value) return;
  requestNavigation(async () => {
    if (await switchProfile(index)) {
      performGo(
        page.value,
        page.value === "configurator"
          ? configuratorSection.value
          : page.value === "diagnostics" ? diagnosticsSection.value : null,
      );
    }
  }, { targetProfile: index });
}

async function applyDraft() {
  try {
    if (!canApply.value) return false;
    if (globalChanged.value) {
      const packet = await command(
        COMMAND.SET_GLOBAL_CONFIG,
        makeGlobalConfigPayload(pollrateHz.value, bootProfile.value, configInfo.value.feature_flags),
      );
      configInfo.value = parseConfigInfo(packet.payload);
      appliedChangeKinds.value = {
        ...appliedChangeKinds.value,
        global: true,
      };
    }
    if (profileChanged.value) await writeProfile();
    profileBackup.value = clone(profileDraft.value);
    await pollAnalogSnapshot();
    notify("Draft applied to firmware RAM.");
    return true;
  } catch (error) {
    log(error.message);
    notify(error.message);
    return false;
  }
}

async function saveConfig() {
  saveInProgress.value = true;
  try {
    if (!canSave.value) return false;
    const packet = await command(COMMAND.SAVE_CONFIG);
    lastStatus.value = parseStatus(packet.payload);
    const infoPacket = await command(COMMAND.GET_CONFIG_INFO);
    configInfo.value = parseConfigInfo(infoPacket.payload);
    profileBackup.value = clone(profileDraft.value);
    calibrationBackup.value = clone(calibrationDraft.value);
    captureSavedBaselines(true);
    notify("Configuration saved and verified.");
    return true;
  } catch (error) {
    log(error.message);
    notify(error.message);
    return false;
  } finally {
    saveInProgress.value = false;
  }
}

function requestRefresh() {
  requestNavigation(refreshAll, { destructive: true });
}

function handleHeaderAction(action) {
  if (action === HEADER_ACTION.CONNECT) {
    void connectFlow();
  } else if (action === HEADER_ACTION.APPLY) {
    void applyDraft();
  } else if (action === HEADER_ACTION.SAVE) {
    void saveConfig();
  }
}

function resetCalibrationProgress() {
  stopCenterTimer(true);
  stopRangeTimer();
  stopTriggerTimer();
  neutralResult.value = null;
  leftRange.value = null;
  rightRange.value = null;
  releasedSamples.value = [];
  triggerPressWindows.value = [];
  wizardStep.value = "neutral";
  wizardError.value = "";
}

function restoreLocalBaselines() {
  if (profileBackup.value) {
    profileDraft.value = clone(profileBackup.value);
  }
  if (calibrationBackup.value) {
    calibrationDraft.value = clone(calibrationBackup.value);
  }
  if (configInfo.value) {
    pollrateHz.value = String(configInfo.value.pollrate_hz);
    bootProfile.value = configInfo.value.boot_profile;
  }
  resetCalibrationProgress();
}

async function rollbackAppliedChanges() {
  if (!appliedRollbackRequired.value) {
    return true;
  }
  if (
    !connected.value
    || !savedBaselineAvailable.value
    || !savedGlobalBaseline.value
  ) {
    return false;
  }

  try {
    if (appliedChangeKinds.value.global) {
      const packet = await command(
        COMMAND.SET_GLOBAL_CONFIG,
        makeGlobalConfigPayload(
          savedGlobalBaseline.value.pollrate_hz,
          savedGlobalBaseline.value.boot_profile,
          savedGlobalBaseline.value.feature_flags,
        ),
      );
      configInfo.value = parseConfigInfo(packet.payload);
    }
    if (appliedChangeKinds.value.profile && savedProfileBaseline.value) {
      profileDraft.value = await writeProfileValue(
        savedProfileBaseline.value,
        selectedProfile.value,
      );
    }
    if (
      appliedChangeKinds.value.calibration
      && savedCalibrationBaseline.value
    ) {
      calibrationDraft.value = await writeCalibrationValue(
        savedCalibrationBaseline.value,
      );
    }

    const savePacket = await command(COMMAND.SAVE_CONFIG);
    lastStatus.value = parseStatus(savePacket.payload);
    const infoPacket = await command(COMMAND.GET_CONFIG_INFO);
    configInfo.value = parseConfigInfo(infoPacket.payload);
    pollrateHz.value = savedGlobalBaseline.value.pollrate_hz;
    bootProfile.value = savedGlobalBaseline.value.boot_profile;
    profileDraft.value = savedProfileBaseline.value
      ? clone(savedProfileBaseline.value)
      : profileDraft.value;
    calibrationDraft.value = savedCalibrationBaseline.value
      ? clone(savedCalibrationBaseline.value)
      : calibrationDraft.value;
    profileBackup.value = profileDraft.value
      ? clone(profileDraft.value)
      : null;
    calibrationBackup.value = calibrationDraft.value
      ? clone(calibrationDraft.value)
      : null;
    captureSavedBaselines(true);
    resetCalibrationProgress();
    notify("Applied changes were rolled back to the saved configuration.");
    return true;
  } catch (error) {
    log(error.message);
    notify(error.message);
    return false;
  }
}

function closeLeaveGuard(restoreFocus = true) {
  leaveGuardOpen.value = false;
  leaveGuardBusy.value = false;
  leaveGuardError.value = "";
  pendingNavigation = null;
  leaveGuardIsDisconnect.value = false;
  if (restoreFocus) {
    const target = leaveGuardReturnFocus.value;
    void nextTick(() => target?.focus?.());
  }
}

async function finishPendingNavigation() {
  const action = pendingNavigation;
  closeLeaveGuard(false);
  if (action) {
    await action();
  }
}

async function applyFromLeaveGuard() {
  leaveGuardBusy.value = true;
  leaveGuardError.value = "";
  const applied = await applyDraft();
  leaveGuardBusy.value = false;
  if (applied) {
    if (!leaveGuardIsDisconnect.value) {
      closeLeaveGuard();
    }
  } else {
    leaveGuardError.value = "Apply failed. Resolve the error before leaving.";
  }
}

async function keepRamFromLeaveGuard() {
  await finishPendingNavigation();
}

async function saveFromLeaveGuard() {
  leaveGuardBusy.value = true;
  leaveGuardError.value = "";
  const saved = await saveConfig();
  leaveGuardBusy.value = false;
  if (saved) {
    await finishPendingNavigation();
  } else {
    leaveGuardError.value = "Save failed. The current page remains open.";
  }
}

async function discardFromLeaveGuard() {
  leaveGuardBusy.value = true;
  leaveGuardError.value = "";
  restoreLocalBaselines();
  const discarded = await rollbackAppliedChanges();
  leaveGuardBusy.value = false;
  if (discarded) {
    await finishPendingNavigation();
  } else {
    leaveGuardError.value = discardReason.value
      || "Discard failed. The current page remains open.";
  }
}

function handleBeforeUnload(event) {
  if (!hasUnsaved.value) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
}

function profileResponseSignature(profiles) {
  return profiles.map((profile) => JSON.stringify({
    stick: profile.stick_response,
    trigger: profile.trigger_response,
    shape: profile.stick_shape,
  })).join("|");
}

async function getRaw() {
  const packet = await command(COMMAND.GET_RAW_INPUT, new Uint8Array(), false);
  latestRaw.value = parseRawInput(packet.payload);
  return latestRaw.value;
}

async function getDigitalInput() {
  if (digitalInputCommandSupported !== false) {
    const packet = await scheduler.enqueue(
      () => client.sendCommand(COMMAND.GET_DIGITAL_INPUT, new Uint8Array()),
      4,
    );
    if (packet.status === 0) {
      digitalInputCommandSupported = true;
      return { ...parseDigitalInput(packet.payload), limited: false };
    }
    if (packet.status !== 0x02) {
      expectOk(packet, "Read digital input");
    }
    digitalInputCommandSupported = false;
  }

  const raw = await getRaw();
  return {
    sequence: raw.sequence,
    digital_mask: digitalMaskFromRawInput(raw),
    limited: true,
  };
}

async function collectUnique(count) {
  const samples = [];
  let attempts = 0;
  while (dedupeSnapshots(samples).length < count && attempts < count * 8) {
    samples.push(await getRaw());
    attempts += 1;
    await new Promise((resolve) => window.setTimeout(resolve, RAW_POLL_MS));
  }
  const unique = dedupeSnapshots(samples);
  if (unique.length < count) {
    throw new Error(`Only ${unique.length}/${count} unique ADC snapshots arrived. Check ADC running state.`);
  }
  return unique.slice(-count);
}

function syncCenterCaptureStatus() {
  const directionIndex = centerReturnCapture?.directionIndex || 0;
  centerCaptureStatus.value = {
    phase: centerReturnCapture?.phase || "idle",
    direction: CENTER_RETURN_DIRECTIONS[directionIndex]
      || CENTER_RETURN_DIRECTIONS.at(-1),
    completed: centerReturnCapture?.returnWindows.length || 0,
    readySamples: centerReturnCapture?.recentSamples.length || 0,
    insufficientSamples: centerReturnCapture?.insufficientSamples || false,
  };
}

function stopCenterTimer(resetStatus = false) {
  centerCaptureActive.value = false;
  if (centerTimer) {
    window.clearTimeout(centerTimer);
    centerTimer = null;
  }
  centerReturnCapture = null;
  if (resetStatus) {
    centerCaptureStatus.value = {
      phase: "idle",
      direction: CENTER_RETURN_DIRECTIONS[0],
      completed: 0,
      readySamples: 0,
      insufficientSamples: false,
    };
  }
}

async function handleCalibrationStageConfirm(raw) {
  const confirmed = consumeCalibrationConfirmEdge(
    calibrationConfirmLatch,
    raw?.buttons,
  );
  if (
    !confirmed
    || page.value !== "calibration"
    || centerCaptureActive.value
    || triggerCaptureActive.value
    || busy.value
    || calibrationConfirmActionActive
    || wizardStep.value === "complete"
  ) {
    return false;
  }

  calibrationConfirmActionActive = true;
  try {
    await wizardPrimary();
  } finally {
    calibrationConfirmActionActive = false;
  }
  return true;
}

function scheduleCenterPoll() {
  if (!centerCaptureActive.value || !centerReturnCapture) {
    return;
  }
  centerTimer = window.setTimeout(async () => {
    try {
      if (!client.busy && centerReturnCapture) {
        const raw = await getRaw();
        const confirmed = consumeCalibrationConfirmEdge(
          calibrationConfirmLatch,
          raw.buttons,
        );
        const complete = recordCenterReturnSample(
          centerReturnCapture,
          raw,
          confirmed,
        );
        syncCenterCaptureStatus();
        if (complete) {
          const returnWindows = centerReturnCapture.returnWindows;
          neutralResult.value = analyzeCenterReturns(returnWindows);
          stopCenterTimer();
          centerCaptureStatus.value = {
            phase: "complete",
            direction: CENTER_RETURN_DIRECTIONS.at(-1),
            completed: CENTER_RETURN_DIRECTIONS.length,
            readySamples: CENTER_RETURN_SAMPLE_COUNT,
            insufficientSamples: false,
          };
          wizardStep.value = "sticks-range";
          wizardError.value = "";
          startRangeCapture();
        }
      }
    } catch (error) {
      stopCenterTimer();
      wizardError.value = error.message;
    }
    scheduleCenterPoll();
  }, RAW_POLL_MS);
}

async function startCenterCapture() {
  stopCenterTimer(true);
  neutralResult.value = null;
  centerCaptureActive.value = true;
  centerCaptureStatus.value = {
    phase: "waiting-confirmation",
    direction: CENTER_RETURN_DIRECTIONS[0],
    completed: 0,
    readySamples: 0,
    insufficientSamples: false,
  };
  centerReturnCapture = createCenterReturnCapture();
  syncCenterCaptureStatus();
  scheduleCenterPoll();
}

function scheduleRangePoll() {
  if (!rangeCaptureActive.value) {
    return;
  }
  rangeTimer = window.setTimeout(async () => {
    try {
      if (!client.busy && rangeSamples.value.length < RANGE_SAMPLE_LIMIT) {
        const raw = await getRaw();
        if (!rangeSamples.value.some((sample) => sample.sequence === raw.sequence)) {
          rangeSamples.value.push(raw);
          rangePreview.value = {
            leftSectorCounts: estimateStickCoverage(
              rangeSamples.value,
              0,
              neutralResult.value,
              configInfo.value?.axis_invert,
            ),
            rightSectorCounts: estimateStickCoverage(
              rangeSamples.value,
              1,
              neutralResult.value,
              configInfo.value?.axis_invert,
            ),
          };
        }
        await handleCalibrationStageConfirm(raw);
      }
    } catch (error) {
      wizardError.value = error.message;
    }
    scheduleRangePoll();
  }, RAW_POLL_MS);
}

function startRangeCapture() {
  rangeSamples.value = [];
  rangePreview.value = {
    leftSectorCounts: Array(16).fill(0),
    rightSectorCounts: Array(16).fill(0),
  };
  rangeCaptureActive.value = true;
  scheduleRangePoll();
}

function stopRangeTimer() {
  rangeCaptureActive.value = false;
  if (rangeTimer) {
    window.clearTimeout(rangeTimer);
    rangeTimer = null;
  }
}

function stopTriggerTimer() {
  triggerCaptureActive.value = false;
  triggerCycleCapture = null;
  if (triggerTimer) {
    window.clearTimeout(triggerTimer);
    triggerTimer = null;
  }
}

async function completeTriggerCycleCapture() {
  stopTriggerTimer();
  const triggers = analyzeTriggers(releasedSamples.value, triggerPressWindows.value);
  calibrationDraft.value = buildCalibrationDraft(
    calibrationDraft.value,
    neutralResult.value,
    leftRange.value,
    rightRange.value,
    triggers,
  );
  wizardStep.value = "validate-calibration";
}

function scheduleTriggerCyclePoll() {
  if (!triggerCaptureActive.value) {
    return;
  }
  triggerTimer = window.setTimeout(async () => {
    try {
      if (!client.busy) {
        const raw = await getRaw();
        consumeCalibrationConfirmEdge(calibrationConfirmLatch, raw.buttons);
        if (
          triggerCaptureActive.value
          && recordTriggerCycleSample(triggerCycleCapture, raw)
        ) {
          triggerPressWindows.value = [...triggerCycleCapture.pressWindows];
          if (triggerPressWindows.value.length >= 5) {
            await completeTriggerCycleCapture();
          }
        }
      }
    } catch (error) {
      stopTriggerTimer();
      wizardError.value = error.message;
    }
    scheduleTriggerCyclePoll();
  }, RAW_POLL_MS);
}

function startTriggerCycleCapture() {
  stopTriggerTimer();
  triggerPressWindows.value = [];
  triggerCycleCapture = createTriggerCycleCapture(releasedSamples.value);
  triggerCaptureActive.value = true;
  scheduleTriggerCyclePoll();
}

async function finishRangeCapture() {
  try {
    const nextLeftRange = analyzeStickRange(
      rangeSamples.value,
      0,
      neutralResult.value,
      configInfo.value?.axis_invert,
    );
    const nextRightRange = analyzeStickRange(
      rangeSamples.value,
      1,
      neutralResult.value,
      configInfo.value?.axis_invert,
    );
    leftRange.value = nextLeftRange;
    rightRange.value = nextRightRange;
    stopRangeTimer();
    wizardStep.value = nextWizardStep(wizardStep.value);
    wizardError.value = "";
  } catch (error) {
    wizardError.value = error.message;
    if (rangeSamples.value.length >= RANGE_SAMPLE_LIMIT) {
      stopRangeTimer();
    }
  }
}

async function wizardPrimary() {
  wizardError.value = "";
  try {
    if (wizardStep.value === "neutral") {
      const profiles = await loadAllProfiles();
      calibrationProfileGuard.value = profileResponseSignature(profiles);
      await startCenterCapture();
    } else if (wizardStep.value === "sticks-range") {
      await finishRangeCapture();
    } else if (wizardStep.value === "triggers-released") {
      releasedSamples.value = await collectUnique(64);
      wizardStep.value = "triggers-pressed";
      startTriggerCycleCapture();
    } else if (wizardStep.value === "triggers-pressed") {
      startTriggerCycleCapture();
    } else if (wizardStep.value === "validate-calibration") {
      const generationBefore = (await readAnalogSnapshot()).runtime_generation;
      await writeCalibration();
      const appliedSnapshot = await readAnalogSnapshot();
      if (!appliedSnapshot.adc_running) {
        throw new Error("Calibration verification failed: ADC pipeline is not running.");
      }
      if (appliedSnapshot.runtime_generation === generationBefore) {
        throw new Error("Calibration verification failed: runtime generation did not advance.");
      }
      const profilesAfter = await loadAllProfiles();
      if (profileResponseSignature(profilesAfter) !== calibrationProfileGuard.value) {
        throw new Error("Profile response verification failed: calibration changed Profile bytes.");
      }
      wizardStep.value = "save";
    } else if (wizardStep.value === "save") {
      if (!await saveConfig()) {
        throw new Error("Calibration save failed.");
      }
      wizardStep.value = "complete";
      log("Calibration saved and verified by firmware.");
    }
  } catch (error) {
    wizardError.value = error.message;
  }
}

function wizardBack() {
  stopRangeTimer();
  stopCenterTimer();
  stopTriggerTimer();
  wizardError.value = "";
  wizardStep.value = nextWizardStep(wizardStep.value, -1);
  if (wizardStep.value === "sticks-range") {
    startRangeCapture();
  } else if (wizardStep.value === "neutral") {
    neutralResult.value = null;
    stopCenterTimer(true);
  }
}

function cancelWizard() {
  requestNavigation(async () => {
    restoreLocalBaselines();
  });
}

/**
 * Read and publish one firmware-owned analog runtime snapshot.
 */
async function readAnalogSnapshot() {
  const packet = await command(COMMAND.GET_ANALOG_SNAPSHOT, new Uint8Array(), false);
  analogSnapshot.value = parseAnalogSnapshot(packet.payload);
  return analogSnapshot.value;
}

async function pollAnalogSnapshot(syncRaw = false) {
  if (
    !connected.value
    || client.busy
    || centerCaptureActive.value
    || rangeCaptureActive.value
    || triggerCaptureActive.value
  ) {
    return;
  }
  try {
    await readAnalogSnapshot();
    if (syncRaw) {
      latestRaw.value = {
        ...latestRaw.value,
        sequence: analogSnapshot.value.sequence,
        adc: [...analogSnapshot.value.raw_adc],
        adc_running: analogSnapshot.value.adc_running,
      };
    }
  } catch (error) {
    log(error.message);
  }
}

function handleGamepadInputReport(event) {
  if (event.device !== client.device || event.reportId !== 0x01) {
    return;
  }
  pendingGamepadInput = event.data;
  if (!gamepadInputFrame) {
    gamepadInputFrame = window.requestAnimationFrame(publishGamepadInput);
  }
}

function publishGamepadInput() {
  const data = pendingGamepadInput;
  pendingGamepadInput = null;
  gamepadInputFrame = 0;
  if (!data) return;
  try {
    const report = parseDs4InputReport(data);
    gamepadInputSequence += 1;
    latestRaw.value = {
      ...latestRaw.value,
      sequence: gamepadInputSequence,
      buttons: report.buttons,
      dpad_hat: report.dpad_hat,
    };
    analogSnapshot.value = {
      ...analogSnapshot.value,
      sequence: gamepadInputSequence,
      hid: report.hid,
      output_stick_q15: report.output_stick_q15,
      output_trigger_q15: report.output_trigger_q15,
    };
    void handleCalibrationStageConfirm(latestRaw.value);
  } catch (error) {
    log(error.message);
  }
}

function startSnapshotPolling() {
  stopSessionTimers();
  gamepadInputDevice = client.device;
  if (gamepadInputDevice) {
    gamepadInputDevice.addEventListener("inputreport", handleGamepadInputReport);
  }
  /* Seed raw/calibrated fields once; ongoing preview uses interrupt IN. */
  void pollAnalogSnapshot(true);
}

function createFallbackProfile() {
  const raw = new Uint8Array(PROFILE_SIZE);
  const profile = {
    index: 0,
    profile_version: PROFILE_VERSION,
    flags: 0,
    color_rgb: [0x30, 0x80, 0xff],
    stick_response: [createLinearResponse(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
    raw,
  };
  writeProfileDraftToPayload(raw, profile);
  return parseProfile(raw, 0);
}

function handleHidDisconnect(event) {
  if (event.device !== client.device) {
    return;
  }
  if (client.transitioning) {
    return;
  }
  if (iapMode.value) {
    return;
  }
  connected.value = false;
  deviceLabel.value = "Disconnected";
  stopCenterTimer();
  stopSessionTimers();
  notify(hasUnsaved.value
    ? "WebHID disconnected. Unsaved work was preserved in this page."
    : "WebHID disconnected. The game controller may remain available.");
}

onMounted(async () => {
  profileDraft.value = createFallbackProfile();
  calibrationDraft.value = clone(defaultCalibration);
  const initialRoute = parseRouteHash(location.hash || "#/home");
  await performParsedRoute(initialRoute);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("beforeunload", handleBeforeUnload);
  navigator.hid?.addEventListener("disconnect", handleHidDisconnect);
});

onUnmounted(() => {
  window.removeEventListener("hashchange", handleHashChange);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  navigator.hid?.removeEventListener("disconnect", handleHidDisconnect);
  stopCenterTimer();
  stopRangeTimer();
  stopTriggerTimer();
  stopSessionTimers();
  void client.close();
});
</script>

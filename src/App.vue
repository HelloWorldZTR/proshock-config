<template>
  <main class="app-shell">
    <div :inert="connectionBlocked || undefined" :aria-hidden="connectionBlocked || undefined" :class="{ 'connection-covered': connectionBlocked, 'settings-footer-page': settingsFooterVisible || automaticCalibrationPage }">
    <div v-if="showSecureNote" class="secure-warning">WebHID requires HTTPS or localhost.</div>
    <AppHeader
      :profiles="profileCards"
      :active="configInfo?.active_profile ?? selectedProfile"
      :boot="configInfo?.boot_profile ?? bootProfile"
      :selected="selectedProfile"
      :profile-draft-changed="profileChanged"
      :connected="connected"
      :busy="busy || iapMode || wizardActionInProgress"
      :profile-switch-blocked="hasUnsaved"
      :disconnecting="disconnecting"
      :current-page="iapMode ? 'firmware' : page"
      :state="headerState"
      :allow-offline="developmentPreview"
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
    <div v-if="developmentPreview && devGateDismissed && !connected && !iapGate.ready" class="dev-preview-banner">
      <span>Development preview · No device connected</span><button type="button" @click="devGateDismissed = false">Restore connection overlay</button>
    </div>
    <HomePage
      v-if="page === 'home' && !iapMode"
      :connected="connected" :busy="busy" :profile-switch-blocked="hasUnsaved"
      :profiles="profileCards" :config-info="configInfo"
      :selected-profile="selectedProfile" :raw="latestRaw" :snapshot="liveInputSnapshot"
      :calibration="calibrationDraft || defaultCalibration" :state-label="stateLabel"
      @connect="connectFlow" @switch-profile="requestProfileSwitch" @edit-profile="requestEditProfile"
    />
    <ConfiguratorPage
      v-else-if="page === 'configurator' && !iapMode"
      :section="configuratorSection" :selected-profile="selectedProfile"
      :profile="profileDraft" :baseline-profile="profileBackup" :pollrate-hz="pollrateHz"
      :boot-profile="bootProfile" :ribbon-mode="ribbonMode" :adc-bits="adcBits" :raw="latestRaw" :snapshot="liveInputSnapshot"
      :calibration="calibrationDraft || defaultCalibration" :config-info="configInfo"
      :connected="connected" :read-digital-input="getDigitalInput"
      :direction-disabled="busy || saveInProgress || calibrationOwnsHeaderActions" @direction="setAnalogDirection"
      @section="requestGo('configurator', $event)" @profile-color="setProfileColor"
      @pollrate="pollrateHz = $event" @boot-profile="bootProfile = $event" @ribbon-mode="setRibbonMode" @adc-bits="setAdcBits"
      @debounce-validity="debounceValid = $event"
      :can-test="connected && !hasDraft && !saveInProgress && !!analogSnapshot"
      @response="setResponse" @resolver="setResolver" @button-debounce="setButtonDebounce"
      @stick-shape="setStickShape" @stick-rc="setStickRc"
      @reset-curves="resetCurves" @copy-curve="copyCurve"
      @calibrate="requestGo('calibration')"
    />
    <div v-else-if="page === 'calibration' && !iapMode" class="page calibration-workspace">
      <nav class="subtabs" aria-label="Calibration sections">
        <button type="button" :class="{ active: calibrationSection === 'automatic' }" :disabled="calibrationOwnsHeaderActions" @click="requestGo('calibration', 'automatic')">Automatic calibration</button>
        <button type="button" :class="{ active: calibrationSection === 'manual' }" :disabled="calibrationOwnsHeaderActions" @click="requestGo('calibration', 'manual')">Manual settings</button>
      </nav>
      <div v-if="calibrationSection === 'manual'" class="page manual-bounds-page">
        <ManualBoundsEditor :calibration="calibrationDraft || defaultCalibration" :errors="calibrationValidation.failures" @update="setCalibrationBound">
          <template #directions>
            <AnalogDirectionEditor :calibration="calibrationDraft || defaultCalibration" :raw="latestRaw" :legacy-axis-invert="configInfo?.axis_invert" :disabled="busy || saveInProgress || calibrationOwnsHeaderActions" @direction="setAnalogDirection" />
          </template>
        </ManualBoundsEditor>
      </div>
    <QuickCalibrationPage
      v-else
      :step="wizardStep" :development-preview="developmentPreview" :busy="busy || saveInProgress || wizardActionInProgress" :offline="!connected" :error="wizardError" :neutral-result="neutralResult"
      :calibration-mode="calibrationMode"
      :center-capture-active="centerCaptureActive" :center-capture-status="centerCaptureStatus"
      :left-range="rangeCaptureActive ? { sectorCounts: rangePreview.leftSectorCounts } : leftRange"
      :right-range="rangeCaptureActive ? { sectorCounts: rangePreview.rightSectorCounts } : rightRange"
      :trigger-capture-active="triggerCaptureActive" :trigger-window-count="triggerPressWindows.length"
      :calibration-valid="calibrationValidation.pass"
      :checks="calibrationChecks"
      @mode="setCalibrationMode"
      @primary="wizardPrimary" @back="wizardBack" @cancel="cancelWizard"
    />
    </div>
    <FirmwareUpgradePage
      ref="firmwarePage"
      v-else-if="page === 'firmware' || iapMode"
      :config-client="client"
      :config-connected="connected"
      :configuration-dirty="hasUnsaved"
      @iap-session="handleIapSession"
      @gate-state="iapGate = $event"
    />
    <AccessoryCenterPage
      v-else-if="page === 'accessories'"
      :ribbon-mode="ribbonMode" :calibration="calibrationDraft || defaultCalibration"
      :config-info="configInfo" :connected="connected"
      :disabled="busy || saveInProgress || calibrationOwnsHeaderActions"
      :motion="motionDraft" :motion-supported="motionSupported" :motion-telemetry="motionTelemetry"
      :motion-calibration="motionCalibration"
      @motion="setMotionDraft" @motion-refresh="refreshMotionStatus"
      @motion-calibrate="startMotionCalibration" @motion-cancel="cancelMotionCalibration"
      @ribbon-mode="setRibbonMode" @direction="setAnalogDirection"
      @buttons="requestGo('configurator', 'buttons')"
    />
    <DiagnosticsPage
      v-else
      :section="diagnosticsSection" :raw="latestRaw" :snapshot="liveInputSnapshot"
      :calibration="calibrationDraft || defaultCalibration" :config-info="configInfo"
      :profile="profileDraft" :connected="connected" :device-label="deviceLabel" :firmware-build-version="firmwareBuildVersion" :logs="logs"
      @section="requestGo('diagnostics', $event)" @export-log="downloadDiagnostics"
    />
    <SettingsApplyFooter v-if="settingsFooterVisible" :state="settingsActionState" :state-label="stateLabel"
      :profile="page === 'calibration' ? undefined : selectedProfile" @primary-action="handleHeaderAction" />
    <CalibrationSafetyDialog v-if="calibrationSafetyOpen" @cancel="closeCalibrationSafety" @continue="confirmCalibrationSafety" />
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
    </div>
    <ConnectionGate v-if="connectionBlocked" :firmware="page === 'firmware'" :busy="busy || iapGate.busy" :error="page === 'firmware' ? (hasUnsaved ? 'Return Home and reconnect to save or discard pending configuration before entering IAP.' : iapGate.error) : connectionError" :blocked="page === 'firmware' && hasUnsaved" :development="developmentPreview" :conflict="connectionConflict"
      @connect="page === 'firmware' ? firmwarePage?.connect() : connectFlow()"
      @home="returnHomeFromGate" @dismiss="devGateDismissed = true"
      @export="downloadProfile" @reload="reloadConnectedDevice" />
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  HEADER_ACTION,
  LEAVE_GUARD_KIND,
  deriveCalibrationGuardPending,
  deriveHeaderState,
  deriveLeaveGuardKind,
  shouldGuardNavigation,
} from "./app-shell-state.js";
import { isConnectionBlocked } from "./connection-gate.js";
import ConnectionGate from "./components/ConnectionGate.vue";
import AnalogDirectionEditor from "./components/AnalogDirectionEditor.vue";
import { analogAxisInvert, changeAnalogDirection } from "./analog-direction.js";
import ManualBoundsEditor from "./components/ManualBoundsEditor.vue";
import AppHeader from "./components/AppHeader.vue";
import SettingsApplyFooter from "./components/SettingsApplyFooter.vue";
import UnsavedChangesDialog from "./components/UnsavedChangesDialog.vue";
import HomePage from "./pages/HomePage.vue";
import ConfiguratorPage from "./pages/ConfiguratorPage.vue";
import QuickCalibrationPage from "./pages/QuickCalibrationPage.vue";
import CalibrationSafetyDialog from "./components/CalibrationSafetyDialog.vue";
import FirmwareUpgradePage from "./pages/FirmwareUpgradePage.vue";
import DiagnosticsPage from "./pages/DiagnosticsPage.vue";
import { MOTION_MIN_BUILD, MOTION_GET, MOTION_SET, validMotion, encodeMotion, parseMotion, motionChanged } from "./motion.js";
import { captureGyroBias } from "./motion-calibration.js";
import AccessoryCenterPage from "./pages/AccessoryCenterPage.vue";
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
  BUTTON_DEBOUNCE_DEFAULT_SAMPLES,
  COMMAND,
  FEATURE_RIBBON_HML,
  ADC_DEPTH_CODES,
  adcDepthFlags,
  CONFIG_STATUS_NAME,
  PROFILE_CHUNK_DATA_SIZE,
  PROFILE_COUNT,
  PROFILE_SIZE,
  PROFILE_VERSION,
  STATUS_NAME,
  createDefaultAnalogCalibration,
  createDefaultStickRc,
  createLinearResponse,
  digitalMaskFromRawInput,
  makeBeginProfilePayload,
  makeGlobalConfigPayload,
  makeProfileChunkRequest,
  makeProfileChunkWrite,
  makeProfileColorPayload,
  makeSwitchProfilePayload,
  makeVersionPayload,
  normalizeButtonDebounceSamples,
  parseAnalogCalibration,
  parseAnalogSnapshot,
  parseConfigInfo,
  parseFirmwareBuildVersion,
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
  analyzeQuickCenter,
  analyzeStickRange,
  analyzeTriggers,
  buildCalibrationDraft,
  createCenterReturnCapture,
  createQuickCenterCapture,
  createTriggerCycleCapture,
  dedupeSnapshots,
  estimateStickCoverage,
  nextWizardStep,
  recordCenterReturnSample,
  recordQuickCenterSample,
  recordTriggerCycleSample,
  validateCalibration,
  validateResponse,
} from "./calibration.js";
import { WebHidClient } from "./webhid-client.js";
import { validateStickRc } from "./rc-filter.js";

const client = new WebHidClient();
const scheduler = new CommandScheduler();
const showSecureNote = !window.isSecureContext || location.protocol === "file:";
const connected = ref(false);
const developmentPreview = import.meta.env.MODE === "development";
const devGateDismissed = ref(false);
const connectionError = ref("");
const connectionConflict = ref(false);
const firmwarePage = ref(null);
const iapGate = ref({ ready: false, busy: false, error: "" });
const debounceValid = ref(true);
let retainedDevice = null;
const busy = ref(false);
const saveInProgress = ref(false);
const disconnecting = ref(false);
const iapMode = ref(false);
const deviceLabel = ref("Disconnected");
const configInfo = ref(null);
const firmwareBuildVersion = ref(null);
const motionDraft = ref(null);
const motionBackup = ref(null);
const savedMotionBaseline = ref(null);
const motionTelemetry = ref(null);
const motionCalibration = ref({ phase: 'idle' });
const motionCalibrationActive = computed(() => ['settling', 'sampling'].includes(motionCalibration.value.phase));
let motionCalibrationToken = 0;
const motionSupported = computed(() => Number.isInteger(firmwareBuildVersion.value) && firmwareBuildVersion.value >= MOTION_MIN_BUILD);
const motionDraftChanged = computed(() => motionSupported.value && motionChanged(motionDraft.value, motionBackup.value));
const lastStatus = ref(null);
const selectedProfile = ref(0);
const bootProfile = ref(0);
const ribbonMode = ref(0);
const adcBits = ref(12);
const profileDraft = ref(null);
const calibrationDraft = ref(null);
const profileBackup = ref(null);
const calibrationBackup = ref(null);
const latestRaw = ref(null);
const analogSnapshot = ref(null);
const wizardStep = ref("neutral");
const calibrationSafetyOpen = ref(false);
const calibrationSafetyAcknowledged = ref(false);
const calibrationSafetyStorageKey = "proshock.calibrationSafety.dismissed.v1";
let calibrationSafetyReturnFocus = null;
const wizardError = ref("");
const calibrationMode = ref("quick");
const neutralResult = ref(null);
const centerCaptureActive = ref(false);
const centerCaptureStatus = ref({
  phase: "idle",
  direction: null,
  completed: 0,
  readySamples: 0,
  mode: "quick",
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
const configuratorSection = ref("system");
const calibrationSection = ref("automatic");
const diagnosticsSection = ref("device");
const toast = ref("");
const wizardActionInProgress = ref(false);
const profileFileInput = ref(null);
const calibrationProfileGuard = ref(null);
const savedProfileBaseline = ref(null);
const savedCalibrationBaseline = ref(null);
const savedGlobalBaseline = ref(null);
const appliedChangeKinds = ref({
  profile: false,
  calibration: false,
  global: false,
  motion: false,
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
const PREVIEW_POLL_MS = 50;
let rangeTimer = null;
let centerTimer = null;
let centerReturnCapture = null;
let triggerTimer = null;
let triggerCycleCapture = null;
let livePollTimer = null;
const calibrationConfirmLatch = createCalibrationConfirmLatch();
let calibrationConfirmActionActive = false;
let digitalInputCommandSupported = null;
let pendingNavigation = null;
let currentRouteHash = "";
let busyDepth = 0;

const pollrateHz = computed({
  get: () => String(profileDraft.value?.pollrate_hz ?? configInfo.value?.pollrate_hz ?? 1000),
  set: (value) => {
    if (profileDraft.value) profileDraft.value.pollrate_hz = Number(value);
  },
});

/*
 * Processed values must come from one firmware-owned analog snapshot. Raw
 * capture remains a separate GET_RAW_INPUT stream for the calibration wizard.
 */
const liveInputSnapshot = computed(() => {
  return createLiveInputSnapshot(analogSnapshot.value);
});
const draftAxisInvert = computed(() => analogAxisInvert(calibrationDraft.value, configInfo.value?.axis_invert));

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
const rcValid = computed(() => (
  profileDraft.value?.stick_rc?.length === 2
  && profileDraft.value.stick_rc.every(validateStickRc)
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
  { id: "calibration", label: "Analog Calibration" },
  { id: "firmware", label: "Firmware Upgrade" },
  { id: "accessories", label: "Accessory Center" },
  { id: "diagnostics", label: "Diagnostics" },
];
const profileChanged = computed(() => (
  profileDraft.value && profileBackup.value
    ? JSON.stringify(profileDraft.value) !== JSON.stringify(profileBackup.value)
    : false
));
const profileColorOnlyChanged = computed(() => {
  if (!profileChanged.value) return false;
  const draft = clone(profileDraft.value);
  draft.color_rgb = clone(profileBackup.value.color_rgb);
  return JSON.stringify(draft) === JSON.stringify(profileBackup.value);
});
const draftFeatureFlags = computed(() => {
  const flags = ((Number(configInfo.value?.feature_flags || 0) & ~FEATURE_RIBBON_HML)
    | (ribbonMode.value === 1 ? FEATURE_RIBBON_HML : 0)) >>> 0;
  // Legacy firmware keeps its unknown ADC flag bytes exactly as received.
  return configInfo.value?.adc_depth_supported ? adcDepthFlags(flags, adcBits.value) : flags;
});
const globalChanged = computed(() => !!configInfo.value && (
  configInfo.value.boot_profile !== bootProfile.value
  || (Number(configInfo.value.feature_flags || 0) >>> 0) !== draftFeatureFlags.value
));
const calibrationChanged = computed(() => (
  calibrationDraft.value && calibrationBackup.value
    ? JSON.stringify(calibrationDraft.value) !== JSON.stringify(calibrationBackup.value)
    : false
));
const calibrationDraftCanApply = computed(() => (
  calibrationChanged.value && (page.value !== "calibration" || calibrationSection.value === "manual")
));
const hasApplyDraft = computed(() => (
  profileChanged.value || globalChanged.value || calibrationDraftCanApply.value || motionDraftChanged.value
));
const hasDraft = computed(() => profileChanged.value || globalChanged.value || calibrationChanged.value || motionDraftChanged.value);
const applyValid = computed(() => (!motionDraftChanged.value || validMotion(motionDraft.value)) && debounceValid.value && responseValid.value && resolverValid.value && rcValid.value && calibrationValidation.value.pass);
const canApply = computed(() => (
  connected.value
  && !busy.value && !saveInProgress.value && !calibrationOwnsHeaderActions.value
  && hasApplyDraft.value
  && applyValid.value
));
const canSave = computed(() => connected.value && !busy.value && !saveInProgress.value && !!configInfo.value?.dirty && !hasDraft.value);
const calibrationWorkflowPending = computed(() => (
  page.value === "calibration" && calibrationSection.value === "automatic"
  && [
    "sticks-range",
    "triggers-released",
    "triggers-pressed",
    "validate-calibration",
  ].includes(wizardStep.value)
));
const calibrationOwnsHeaderActions = computed(() => (
  calibrationSection.value === "automatic"
  && (
    wizardActionInProgress.value
    || centerCaptureActive.value
    || !["neutral", "complete"].includes(wizardStep.value)
  )
));
const calibrationPendingForGuard = computed(() => deriveCalibrationGuardPending({
  wizardStep: wizardStep.value,
  workflowPending: calibrationWorkflowPending.value,
  centerCaptureActive: centerCaptureActive.value,
  completedCenterReturns: centerCaptureStatus.value.completed,
  calibrationChanged: calibrationChanged.value,
}));
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
  calibrationOwnsActions: calibrationOwnsHeaderActions.value
    || (calibrationChanged.value && !calibrationDraftCanApply.value),
  hasUnsaved: hasUnsaved.value,
}));
const automaticCalibrationPage = computed(() => !iapMode.value && page.value === "calibration" && calibrationSection.value === "automatic");
// Every connected configuration page shares one persistent action bar.
const settingsFooterVisible = computed(() => !iapMode.value && !automaticCalibrationPage.value
  && (connected.value || page.value === "configurator" || page.value === "calibration"));
// The footer uses the same action as the header; offline connection stays in the header.
const settingsActionState = computed(() => connected.value ? headerState.value : {
  mode: "offline", label: "Apply", action: null, disabled: true, spinning: false,
});
const connectionBlocked = computed(() => isConnectionBlocked({
  page: page.value, connected: connected.value, iapReady: iapGate.value.ready,
  development: developmentPreview, dismissed: devGateDismissed.value,
}));
/** Exit the gate without leaving an unowned IAP session running. */
function returnHomeFromGate() {
  iapMode.value = false;
  iapGate.value = { ready: false, busy: false, error: "" };
  performGo("home");
}
watch(connectionBlocked, (blocked) => { if (blocked) leaveGuardOpen.value = false; });

const appliedRollbackRequired = computed(() => (
  appliedChangeKinds.value.profile
  || appliedChangeKinds.value.calibration
  || appliedChangeKinds.value.global
  || appliedChangeKinds.value.motion
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
  if (saveInProgress.value || configInfo.value?.save_active) return "Saving…";
  if (busy.value) return "Working…";
  if (hasDraft.value) return "Draft changed";
  if (configInfo.value?.dirty) return "Applied · Not saved";
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
    checks.push({
      pass: true,
      label: "Center calibration mode",
      detail: neutralResult.value.mode === "standard"
        ? "Standard four-direction automatic return capture."
        : "Quick single-window neutral capture.",
    });
    neutralResult.value.axes.forEach((axis) => checks.push({
      pass: true,
      status: axis.warning ? "warning" : "pass",
      label: `${axis.name} neutral stability`,
      detail: neutralResult.value.mode === "standard"
        ? `Returns ${axis.returnCenters.join(" / ")}; max window noise ${axis.noiseSpan.toFixed(1)} counts (warn > 32); direction spread ${axis.returnCenterSpan.toFixed(1)} counts (warn > 64).`
        : `Center ${axis.center}; window noise ${axis.noiseSpan.toFixed(1)} counts (warn > 32).`,
    }));
    neutralResult.value.warnings?.forEach((warning) => checks.push({
      pass: true,
      status: "warning",
      label: "Automatic center fallback",
      detail: `${warning.stage} used the best available center window after waiting; noise span ${warning.noiseSpan.toFixed(1)} counts.`,
    }));
  }
  [leftRange.value, rightRange.value].filter(Boolean).forEach((range) => {
    checks.push({
      pass: range.sectorCounts.every((count) => count >= 8),
      label: `${range.stickIndex ? "Right" : "Left"} stick outer coverage`,
      detail: `${range.sectorCounts.filter((count) => count >= 8).length}/16 sectors have at least 8 rim samples.`,
    });
    range.warnings?.forEach((warning) => checks.push({
      pass: true,
      status: "warning",
      label: `${warning.axis} center noise`,
      detail: `${(warning.ratio * 100).toFixed(2)}% of its shorter calibrated span (${warning.noiseSpan.toFixed(1)} / ${warning.shorterSpan} counts; warn > 2%).`,
    }));
  });
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

function beginBusy() {
  busyDepth += 1;
  busy.value = true;
}

function endBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
  busy.value = busyDepth > 0;
}

async function runBusyOperation(operation) {
  beginBusy();
  try {
    return await operation();
  } finally {
    endBusy();
  }
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
    : nextPage === "diagnostics" ? `/${nextDiagnosticsSection}` : nextPage === "calibration" ? `/${section || calibrationSection.value}` : "";
  return `#/${nextPage}${suffix}`;
}

function performGo(nextPage, section = null) {
  if (nextPage !== 'accessories') cancelMotionCalibration();
  if (calibrationSafetyOpen.value && (nextPage !== "calibration" || (section && section !== "automatic"))) closeCalibrationSafety();
  if (
    nextPage === "calibration"
    && page.value !== "calibration"
    && wizardStep.value === "neutral"
    && !centerCaptureActive.value
  ) {
    calibrationMode.value = "quick";
  }
  page.value = nextPage;
  if (nextPage === "configurator" && section) configuratorSection.value = section === "general" ? "system" : section;
  if (nextPage === "calibration" && section) calibrationSection.value = section === "manual" ? "manual" : "automatic";
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
    route.section = parts.at(-1) === "general" ? "system" : parts.at(-1) || "system";
  }
  if (nextPage === "calibration") route.section = parts[1] === "manual" ? "manual" : "automatic";
  if (nextPage === "diagnostics") {
    route.section = parts[1] || "device";
  }
  return route;
}

async function performParsedRoute(route) {
  if (iapMode.value && route.page !== "firmware") return false;
  if (route.page === "calibration" && route.section === "manual" && calibrationOwnsHeaderActions.value) {
    notify("Finish or cancel automatic calibration first."); return false;
  }
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
  requestGo(nextPage, nextPage === "diagnostics" && page.value !== "diagnostics" ? "device" : null);
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
  if (hasUnsaved.value) {
    notify("Save the current configuration before switching Profiles.");
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

function setButtonDebounce(value) {
  if (profileDraft.value) {
    profileDraft.value.button_debounce_samples =
      normalizeButtonDebounceSamples(value);
  }
}

function setStickShape({ stickIndex, sector, scaleQ15 }) {
  const scales = profileDraft.value?.stick_shape?.[stickIndex]?.scale_q15;
  if (!scales || sector < 0 || sector >= scales.length) {
    return;
  }
  scales[sector] = scaleQ15;
}

function setStickRc({ stickIndex, value }) {
  if (!profileDraft.value?.stick_rc?.[stickIndex] || !validateStickRc(value)) {
    return;
  }
  profileDraft.value.stick_rc[stickIndex] = value;
}

/** @brief Gate optional sensor drafts by actual device build and operation ownership. */
function setMotionDraft(value) {
  if (!connected.value || !motionSupported.value || busy.value || saveInProgress.value || calibrationOwnsHeaderActions.value) return;
  motionDraft.value = clone(value);
}
/** @brief Refresh runtime sensor state without replacing unsent filter edits. */
async function refreshMotionStatus() {
  if (!connected.value || !motionSupported.value || busy.value || saveInProgress.value) return;
  return runBusyOperation(async () => {
    try { motionTelemetry.value = parseMotion((await command(MOTION_GET)).payload); }
    catch (error) { notify(error.message); }
  });
}

/** @brief Cancel collection; pending reads may finish but cannot change the draft. */
function cancelMotionCalibration(message = null) {
  if (!motionCalibrationActive.value) return;
  motionCalibrationToken += 1;
  motionCalibration.value = message ? { phase: 'error', message } : { phase: 'idle' };
}

/** @brief Guide stillness capture and stage only gyro offsets for Apply then Save. */
async function startMotionCalibration() {
  if (!connected.value || !motionSupported.value || !motionDraft.value?.enabled
    || busy.value || saveInProgress.value || calibrationOwnsHeaderActions.value) return;
  if (!motionBackup.value?.enabled) {
    motionCalibration.value = { phase: 'error', message: 'Sensor is not streaming. Apply Motion sensor and retry.' };
    return;
  }
  const token = ++motionCalibrationToken;
  const device = client.device;
  const draft = clone(motionDraft.value);
  const cancelled = () => token !== motionCalibrationToken;
  return runBusyOperation(async () => {
    try {
      const gyro_bias = await captureGyroBias({
        now: () => Date.now(),
        wait: ms => new Promise(resolve => window.setTimeout(resolve, ms)),
        cancelled,
        onProgress: state => { motionCalibration.value = state; },
        readSample: async () => {
          if (!connected.value || client.device !== device) throw new Error('Controller disconnected. Retry calibration.');
          if (document.hidden) throw new Error('Keep this tab visible and retry calibration.');
          const sensor = parseMotion((await command(MOTION_GET, new Uint8Array(), false)).payload);
          if (!cancelled()) motionTelemetry.value = sensor;
          return sensor;
        },
      });
      if (cancelled()) return;
      if (!connected.value || client.device !== device) throw new Error('Controller disconnected. Retry calibration.');
      if (JSON.stringify(motionDraft.value) !== JSON.stringify(draft)) throw new Error('Motion settings changed. Retry calibration.');
      motionDraft.value = { ...motionDraft.value, gyro_bias };
      motionCalibration.value = { phase: 'success', message: 'Gyro calibration complete. Apply and Save to keep the result.' };
    } catch (error) {
      if (!cancelled()) motionCalibration.value = { phase: 'error', message: error.message };
    }
  });
}

/** @brief Edit ribbon wiring without altering other feature bits. */
function setRibbonMode(value) {
  if (![0, 1].includes(value) || busy.value || saveInProgress.value || calibrationOwnsHeaderActions.value) return;
  if (connected.value && !configInfo.value?.ribbon_mode_supported) return;
  ribbonMode.value = value;
}

/** @brief Edit supported device-level depth; external acquisition is not available yet. */
function setAdcBits(value) {
  if (!ADC_DEPTH_CODES.includes(value) || busy.value || saveInProgress.value || calibrationOwnsHeaderActions.value) return;
  if (connected.value && !configInfo.value?.adc_depth_supported) return;
  adcBits.value = value;
}

/** @brief Change global direction and its physical calibration coordinates together. */
function setAnalogDirection({ channel, inverted }) {
  if (!calibrationDraft.value || busy.value || saveInProgress.value || calibrationOwnsHeaderActions.value) return;
  calibrationDraft.value = changeAnalogDirection(calibrationDraft.value, channel, inverted);
}

function setCalibrationBound({ kind = "axis", index, axis, field, value }) {
  const targetIndex = index ?? axis;
  const fields = kind === "trigger"
    ? ["raw_released", "raw_pressed"]
    : ["raw_min", "raw_center", "raw_max"];
  const target = calibrationDraft.value?.[kind]?.[targetIndex];
  if (!target || !fields.includes(field)) return;
  target[field] = Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 4095 ? value : NaN;
}

function resetCurves(kind) {
  const field = kind === "sticks" ? "stick_response" : "trigger_response";
  profileDraft.value[field] = [createLinearResponse(), createLinearResponse()];
  if (kind === "sticks") profileDraft.value.stick_rc.forEach((rc) => {
    rc.anti_deadzone_enabled = 0;
    rc.anti_deadzone_gain_tenths = 0;
  });
}

function copyCurve(kind) {
  const field = kind === "sticks" ? "stick_response" : "trigger_response";
  profileDraft.value[field][1] = clone(profileDraft.value[field][0]);
  if (kind === "sticks") {
    const [source, target] = profileDraft.value.stick_rc;
    target.anti_deadzone_enabled = source.anti_deadzone_enabled || 0;
    target.anti_deadzone_gain_tenths = source.anti_deadzone_gain_tenths || 0;
  }
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
    downloadJson("proshock-device.proshock-backup.json", exportBackup(configInfo.value, profiles, calibrationDraft.value, motionSupported.value ? motionDraft.value : null));
    notify("Full device backup exported.");
  } catch (error) {
    log(error.message);
  }
}

function chooseProfileImport() {
  if (!connected.value && !developmentPreview) return;
  profileFileInput.value?.click();
}

async function importProfileFile(event) {
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    let envelope;
    try {
      envelope = JSON.parse(await file.text());
    } catch {
      throw new Error("Profile file is not valid JSON.");
    }
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
    firmware_build_version: firmwareBuildVersion.value,
    analog_calibration: calibrationDraft.value,
    active_profile: profileDraft.value,
    analog: analogSnapshot.value,
    events: logs.value,
    firmware_blocked: ["effective report telemetry", "jitter", "skip/coalesce", ...(firmwareBuildVersion.value == null ? ["firmware build"] : []), "board revision", "USB speed", "factory reset"],
  });
}

function expectOk(packet, operation) {
  if (packet.status !== 0) {
    throw new Error(`${operation}: ${STATUS_NAME[packet.status] || packet.status}`);
  }
}

async function command(commandId, payload = new Uint8Array(), showBusy = true) {
  if (showBusy) {
    beginBusy();
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
      endBusy();
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
    makeVersionPayload(value.calibration_version),
    0,
    new Uint8Array(),
  );
  configInfo.value = parseConfigInfo(packet.payload);
  return parseAnalogCalibration(bytes);
}

/** @brief Apply a calibration snapshot while preserving newer edits. */
async function writeCalibration() {
  const submitted = clone(calibrationDraft.value);
  const applied = await writeCalibrationValue(submitted);
  // Edits made while USB is busy belong to the next Apply.
  if (JSON.stringify(calibrationDraft.value) === JSON.stringify(submitted)) {
    calibrationDraft.value = applied;
  }
  calibrationBackup.value = clone(applied);
  appliedChangeKinds.value = {
    ...appliedChangeKinds.value,
    calibration: true,
  };
}

async function writeProfileValue(value, profileIndex) {
  if (configInfo.value?.schema_version < 13 && value.stick_rc?.some(
    (rc) => rc.anti_deadzone_enabled || rc.anti_deadzone_gain_tenths,
  )) throw new Error("Update firmware to use anti-deadzone.");
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

/** @brief Apply a Profile snapshot without replacing edits made in flight. */
async function writeProfile() {
  const submitted = clone(profileDraft.value);
  const applied = await writeProfileValue(
    submitted,
    selectedProfile.value,
  );
  if (JSON.stringify(profileDraft.value) === JSON.stringify(submitted)) {
    profileDraft.value = applied;
  }
  profileBackup.value = clone(applied);
  appliedChangeKinds.value = {
    ...appliedChangeKinds.value,
    profile: true,
  };
}

/** @brief Apply the submitted color and retain concurrent Profile edits. */
async function writeProfileColor() {
  const submitted = clone(profileDraft.value);
  const packet = await command(
    COMMAND.SET_PROFILE_COLOR,
    makeProfileColorPayload(selectedProfile.value, submitted.color_rgb),
  );
  configInfo.value = parseConfigInfo(packet.payload);
  const bytes = new Uint8Array(submitted.raw);
  writeProfileDraftToPayload(bytes, submitted);
  const applied = parseProfile(bytes, selectedProfile.value);
  if (JSON.stringify(profileDraft.value) === JSON.stringify(submitted)) {
    profileDraft.value = applied;
  }
  profileBackup.value = clone(applied);
  appliedChangeKinds.value = {
    ...appliedChangeKinds.value,
    profile: true,
  };
}

/** @brief Capture only configuration acknowledged by the controller. */
function captureSavedBaselines(available = true) {
  savedMotionBaseline.value = motionBackup.value ? clone(motionBackup.value) : null;
  savedProfileBaseline.value = profileBackup.value
    ? clone(profileBackup.value)
    : null;
  savedCalibrationBaseline.value = calibrationBackup.value
    ? clone(calibrationBackup.value)
    : null;
  savedGlobalBaseline.value = configInfo.value
    ? {
        boot_profile: configInfo.value.boot_profile,
        feature_flags: configInfo.value.feature_flags,
      }
    : null;
  savedBaselineAvailable.value = available;
  appliedChangeKinds.value = {
    profile: false,
    calibration: false,
    global: false,
    motion: false,
  };
}

/** Open a device, validate its configuration, then release the connection gate. */
async function connectFlow() {
  if (busy.value) return;
  connectionError.value = "";
  connectionConflict.value = false;
  const preserve = hasUnsaved.value && !!configInfo.value;
  try {
    beginBusy();
    const device = await client.connect();
    if (!device) return;
    digitalInputCommandSupported = null;
    if (preserve) {
      const info = parseConfigInfo((await command(COMMAND.GET_CONFIG_INFO)).payload);
      const profile = await readProfile(selectedProfile.value);
      const calibration = await readCalibration();
      const build = await readFirmwareBuildVersion();
      const sensor = Number.isInteger(build) && build >= MOTION_MIN_BUILD
        ? parseMotion((await command(MOTION_GET)).payload) : null;
      if (device !== retainedDevice || info.active_profile !== selectedProfile.value
          || JSON.stringify(profile) !== JSON.stringify(profileBackup.value)
          || JSON.stringify(calibration) !== JSON.stringify(calibrationBackup.value)
          || build !== firmwareBuildVersion.value
          || (!!motionBackup.value !== !!sensor)
          || (sensor && motionChanged(sensor.config, motionBackup.value))
          || info.boot_profile !== configInfo.value.boot_profile
          || info.feature_flags !== configInfo.value.feature_flags) {
        connectionConflict.value = true;
        throw new Error("Device settings differ from this draft. Export your draft or discard it before continuing.");
      }
      configInfo.value = info;
      notify("Controller reconnected. Unsaved work was preserved.");
    } else if (!await refreshAll()) {
      throw new Error("Could not load device settings. Please reconnect.");
    }
    retainedDevice = device;
    connected.value = true;
    devGateDismissed.value = false;
    deviceLabel.value = `${device.productName || "ProShock 4"} · WebHID`;
    startSnapshotPolling();
  } catch (error) {
    stopSessionTimers();
    connected.value = false;
    connectionError.value = error.message;
    log(error.message);
    if (!connectionConflict.value) await client.close().catch(() => {});
  } finally { endBusy(); }
}
/** Resolve an explicit reconnect conflict by replacing local drafts with device data. */
async function reloadConnectedDevice() {
  if (busy.value || !client.connected) return;
  beginBusy();
  try {
    if (!await refreshAll()) throw new Error("Could not load device settings. Please reconnect.");
    retainedDevice = client.device;
    connected.value = true;
    connectionConflict.value = false;
    connectionError.value = "";
    devGateDismissed.value = false;
    deviceLabel.value = `${client.device.productName || "ProShock 4"} · WebHID`;
    startSnapshotPolling();
  } catch (error) { connectionError.value = error.message; }
  finally { endBusy(); }
}

function stopSessionTimers() {
  cancelMotionCalibration(connected.value ? null : 'Controller disconnected. Retry calibration.');
  if (livePollTimer) {
    window.clearInterval(livePollTimer);
    livePollTimer = null;
  }
}

async function disconnectDevice() {
  if (!connected.value || disconnecting.value) return;
  disconnecting.value = true;
  stopCenterTimer();
  stopRangeTimer();
  stopTriggerTimer();
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
    analogSnapshot.value = null;
    latestRaw.value = null;
    devGateDismissed.value = false;
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

/** @brief Read optional build metadata without rejecting older firmware sessions. */
async function readFirmwareBuildVersion() {
  const packet = await scheduler.enqueue(
    () => client.sendCommand(COMMAND.GET_BUILD_INFO, new Uint8Array()), 4,
  );
  if (packet.status === 0x02) return null;
  expectOk(packet, "GET_BUILD_INFO");
  return parseFirmwareBuildVersion(packet.payload);
}

async function refreshAll() {
  try {
    const infoPacket = await command(COMMAND.GET_CONFIG_INFO);
    configInfo.value = parseConfigInfo(infoPacket.payload);
    try { firmwareBuildVersion.value = await readFirmwareBuildVersion(); }
    catch (error) { firmwareBuildVersion.value = null; log(error.message); }
    motionDraft.value = null; motionBackup.value = null; motionTelemetry.value = null;
    if (motionSupported.value) {
      const sensor = parseMotion((await command(MOTION_GET)).payload);
      motionDraft.value = clone(sensor.config); motionBackup.value = clone(sensor.config);
      motionTelemetry.value = sensor;
    }
    const statusPacket = await command(COMMAND.GET_STATUS);
    lastStatus.value = parseStatus(statusPacket.payload);
    selectedProfile.value = configInfo.value.active_profile;
    bootProfile.value = configInfo.value.boot_profile;
    ribbonMode.value = (configInfo.value.feature_flags & FEATURE_RIBBON_HML) ? 1 : 0;
    adcBits.value = configInfo.value.adc_bits;
    profileDraft.value = await readProfile(selectedProfile.value);
    calibrationDraft.value = await readCalibration();
    profileBackup.value = clone(profileDraft.value);
    calibrationBackup.value = clone(calibrationDraft.value);
    captureSavedBaselines(!configInfo.value.dirty);
    allProfiles.value = [];
    resetCalibrationProgress();
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
  return runBusyOperation(async () => {
    try {
      const packet = await command(COMMAND.SWITCH_PROFILE, makeSwitchProfilePayload(index));
      const nextInfo = parseConfigInfo(packet.payload);
      const nextProfile = await readProfile(index);
      configInfo.value = nextInfo;
      selectedProfile.value = index;
      profileDraft.value = nextProfile;
      profileBackup.value = clone(nextProfile);
      if (!nextInfo.dirty) {
        savedProfileBaseline.value = clone(nextProfile);
        savedBaselineAvailable.value = true;
      }
      return true;
    } catch (error) {
      log(error.message);
      notify(error.message);
      return false;
    }
  });
}

function requestProfileSwitch(index) {
  if (index === selectedProfile.value) return;
  if (hasUnsaved.value) {
    notify("Save the current configuration before switching Profiles.");
    return;
  }
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

/** @brief Apply pending configuration without treating later edits as applied. */
async function applyDraft() {
  if (!canApply.value) return false;
  return runBusyOperation(async () => {
    try {
      if (motionDraftChanged.value) {
        const submitted = clone(motionDraft.value);
        const sensor = parseMotion((await command(MOTION_SET, encodeMotion(submitted))).payload);
        if (String(encodeMotion(sensor.config)) !== String(encodeMotion(submitted))) throw new Error("Motion settings verification failed.");
        if (!motionChanged(motionDraft.value, submitted)) motionDraft.value = clone(sensor.config);
        motionBackup.value = clone(sensor.config);
        motionTelemetry.value = sensor;
        appliedChangeKinds.value = { ...appliedChangeKinds.value, motion: true };
        configInfo.value = parseConfigInfo((await command(COMMAND.GET_CONFIG_INFO)).payload);
      }
      if (globalChanged.value) {
        const packet = await command(
          COMMAND.SET_GLOBAL_CONFIG,
          makeGlobalConfigPayload(profileDraft.value.pollrate_hz, bootProfile.value, draftFeatureFlags.value),
        );
        configInfo.value = parseConfigInfo(packet.payload);
        appliedChangeKinds.value = {
          ...appliedChangeKinds.value,
          global: true,
        };
      }
      if (profileChanged.value) {
        if (profileColorOnlyChanged.value) await writeProfileColor();
        else await writeProfile();
      }
      if (calibrationChanged.value) await writeCalibration();
      await pollAnalogSnapshot();
      notify("Draft applied to firmware RAM.");
      return true;
    } catch (error) {
      log(error.message);
      notify(error.message);
      return false;
    }
  });
}

/** @brief Persist applied RAM settings while preserving unsent browser drafts. */
async function saveConfig() {
  if (!canSave.value) return false;
  saveInProgress.value = true;
  try {
    const packet = await command(COMMAND.SAVE_CONFIG);
    lastStatus.value = parseStatus(packet.payload);
    const infoPacket = await command(COMMAND.GET_CONFIG_INFO);
    configInfo.value = parseConfigInfo(infoPacket.payload);
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

/** @brief Run the shared header/footer action through existing operation guards. */
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
  calibrationMode.value = "quick";
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

function setCalibrationMode(mode) {
  if (
    wizardStep.value !== "neutral"
    || centerCaptureActive.value
    || !["quick", "standard"].includes(mode)
  ) {
    return;
  }
  calibrationMode.value = mode;
  neutralResult.value = null;
  wizardError.value = "";
  stopCenterTimer(true);
}

function restoreLocalBaselines() {
  motionDraft.value = motionBackup.value ? clone(motionBackup.value) : null;
  if (profileBackup.value) {
    profileDraft.value = clone(profileBackup.value);
  }
  if (calibrationBackup.value) {
    calibrationDraft.value = clone(calibrationBackup.value);
  }
  if (configInfo.value) {
    bootProfile.value = configInfo.value.boot_profile;
    ribbonMode.value = (configInfo.value.feature_flags & FEATURE_RIBBON_HML) ? 1 : 0;
    adcBits.value = configInfo.value.adc_bits;
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
    if (appliedChangeKinds.value.motion && savedMotionBaseline.value) {
      const sensor = parseMotion((await command(MOTION_SET, encodeMotion(savedMotionBaseline.value))).payload);
      motionBackup.value = clone(sensor.config);
      motionDraft.value = clone(sensor.config);
    }
    if (appliedChangeKinds.value.global) {
      const packet = await command(
        COMMAND.SET_GLOBAL_CONFIG,
        makeGlobalConfigPayload(
          savedProfileBaseline.value?.pollrate_hz
            ?? profileDraft.value.pollrate_hz,
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
    bootProfile.value = savedGlobalBaseline.value.boot_profile;
    ribbonMode.value = (savedGlobalBaseline.value.feature_flags & FEATURE_RIBBON_HML) ? 1 : 0;
    adcBits.value = ADC_DEPTH_CODES[(savedGlobalBaseline.value.feature_flags >>> 1) & 3];
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

/** @brief Publish progress for quick windows and standard return captures. */
function syncCenterCaptureStatus() {
  const directionIndex = centerReturnCapture?.directionIndex || 0;
  centerCaptureStatus.value = {
    phase: centerReturnCapture?.phase || "idle",
    mode: centerReturnCapture?.mode || calibrationMode.value,
    direction: centerReturnCapture?.mode === "standard"
      ? CENTER_RETURN_DIRECTIONS[directionIndex] || CENTER_RETURN_DIRECTIONS.at(-1)
      : null,
    // Quick capture has one selected window, without a returnWindows array.
    completed: centerReturnCapture?.returnWindows?.length || 0,
    readySamples: centerReturnCapture?.recentSamples.length || 0,
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
      mode: calibrationMode.value,
      direction: calibrationMode.value === "standard" ? CENTER_RETURN_DIRECTIONS[0] : null,
      completed: 0,
      readySamples: 0,
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
    || wizardActionInProgress.value
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
        consumeCalibrationConfirmEdge(calibrationConfirmLatch, raw.buttons);
        const complete = centerReturnCapture.mode === "quick"
          ? recordQuickCenterSample(centerReturnCapture, raw)
          : recordCenterReturnSample(centerReturnCapture, raw);
        syncCenterCaptureStatus();
        if (complete) {
          const completedCapture = centerReturnCapture;
          neutralResult.value = completedCapture.mode === "quick"
            ? analyzeQuickCenter(
                completedCapture.selectedWindow,
                completedCapture.warnings,
              )
            : analyzeCenterReturns(
                completedCapture.returnWindows,
                completedCapture.warnings,
              );
          stopCenterTimer();
          centerCaptureStatus.value = {
            phase: "complete",
            mode: completedCapture.mode,
            direction: completedCapture.mode === "standard"
              ? CENTER_RETURN_DIRECTIONS.at(-1)
              : null,
            completed: completedCapture.mode === "standard"
              ? CENTER_RETURN_DIRECTIONS.length
              : 1,
            readySamples: CENTER_RETURN_SAMPLE_COUNT,
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
    phase: calibrationMode.value === "quick" ? "settling" : "baseline",
    mode: calibrationMode.value,
    direction: calibrationMode.value === "standard" ? CENTER_RETURN_DIRECTIONS[0] : null,
    completed: 0,
    readySamples: 0,
  };
  centerReturnCapture = calibrationMode.value === "quick"
    ? createQuickCenterCapture()
    : createCenterReturnCapture(draftAxisInvert.value);
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
              draftAxisInvert.value,
            ),
            rightSectorCounts: estimateStickCoverage(
              rangeSamples.value,
              1,
              neutralResult.value,
              draftAxisInvert.value,
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
  const triggers = analyzeTriggers(releasedSamples.value, triggerPressWindows.value, calibrationDraft.value.direction_mask);
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
  triggerCycleCapture = createTriggerCycleCapture(releasedSamples.value, calibrationDraft.value.direction_mask);
  triggerCaptureActive.value = true;
  scheduleTriggerCyclePoll();
}

async function finishRangeCapture() {
  try {
    const nextLeftRange = analyzeStickRange(
      rangeSamples.value,
      0,
      neutralResult.value,
      draftAxisInvert.value,
    );
    const nextRightRange = analyzeStickRange(
      rangeSamples.value,
      1,
      neutralResult.value,
      draftAxisInvert.value,
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

/** @brief Read the optional browser-level dismissal without blocking calibration if storage is unavailable. */
function calibrationSafetyDismissed() {
  try { return window.localStorage?.getItem(calibrationSafetyStorageKey) === "1"; }
  catch { return false; }
}
/** @brief Return focus to the Start button after closing the hardware warning. */
function closeCalibrationSafety() {
  calibrationSafetyOpen.value = false;
  const focusTarget = calibrationSafetyReturnFocus;
  calibrationSafetyReturnFocus = null;
  void nextTick(() => focusTarget?.focus?.());
}
/** @brief Acknowledge this session's warning and optionally remember the choice. */
function confirmCalibrationSafety(dontShowAgain) {
  if (!calibrationSafetyOpen.value) return;
  if (dontShowAgain) {
    try { window.localStorage?.setItem(calibrationSafetyStorageKey, "1"); }
    catch { /* Private mode may deny storage; the session acknowledgement still works. */ }
  }
  calibrationSafetyAcknowledged.value = true;
  closeCalibrationSafety();
  return wizardPrimary();
}
/** @brief Advance calibration once, retaining firmware verification before Save. */
async function wizardPrimary() {
  if (!connected.value || busy.value || saveInProgress.value || wizardActionInProgress.value || wizardStep.value === "complete" || calibrationSafetyOpen.value) return;
  if (wizardStep.value === "neutral" && !calibrationSafetyAcknowledged.value && !calibrationSafetyDismissed()) {
    calibrationSafetyReturnFocus = document.activeElement;
    calibrationSafetyOpen.value = true;
    return;
  }
  wizardActionInProgress.value = true;
  wizardError.value = "";
  try {
    if (wizardStep.value === "neutral") {
      if (calibrationChanged.value) throw new Error("Apply hardware directions and calibration bounds before starting automatic calibration.");
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
    if (wizardStep.value === "neutral") stopCenterTimer(true);
    wizardError.value = error.message;
  } finally {
    wizardActionInProgress.value = false;
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
    calibrationMode.value = "quick";
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
    || motionCalibrationActive.value
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

async function pollLiveState() {
  if (
    !connected.value
    || motionCalibrationActive.value
    || client.busy
    || centerCaptureActive.value
    || rangeCaptureActive.value
    || triggerCaptureActive.value
    || calibrationConfirmActionActive
  ) {
    return;
  }
  try {
    const raw = await getRaw();
    if (!await handleCalibrationStageConfirm(raw)) {
      await pollAnalogSnapshot();
    }
  } catch (error) {
    log(error.message);
  }
}

function startSnapshotPolling() {
  if (!livePollTimer) {
    void pollLiveState();
    livePollTimer = window.setInterval(pollLiveState, PREVIEW_POLL_MS);
  }
}

function createFallbackProfile() {
  const raw = new Uint8Array(PROFILE_SIZE);
  const profile = {
    index: 0,
    profile_version: PROFILE_VERSION,
    flags: 0,
    color_rgb: [0x30, 0x80, 0xff],
    button_debounce_samples: BUTTON_DEBOUNCE_DEFAULT_SAMPLES,
    pollrate_hz: 1000,
    stick_response: [createLinearResponse(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
    stick_rc: [createDefaultStickRc(), createDefaultStickRc()],
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
  stopRangeTimer();
  stopTriggerTimer();
  stopSessionTimers();
  analogSnapshot.value = null;
  latestRaw.value = null;
  devGateDismissed.value = false;
  notify(hasUnsaved.value
    ? "WebHID disconnected. Unsaved work was preserved in this page."
    : "WebHID disconnected. The game controller may remain available.");
}

onMounted(async () => {
  profileDraft.value = createFallbackProfile();
  calibrationDraft.value = clone(defaultCalibration);
  profileBackup.value = clone(profileDraft.value);
  calibrationBackup.value = clone(calibrationDraft.value);
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

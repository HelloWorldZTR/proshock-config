<template>
  <div class="page firmware-page">
    <header class="page-heading firmware-page-heading">
      <span class="eyebrow">Device maintenance</span>
      <h1>Firmware Upgrade</h1>
      <p>Enter the controller's isolated IAP environment before selecting or installing firmware.</p>
    </header>

    <section class="firmware-recovery-note" role="note">
      <div class="firmware-recovery-icon" aria-hidden="true"><Power /></div>
      <div>
        <strong>Hardware recovery is always available</strong>
        <p>After power is removed, hold <b>PS + Options</b> while reconnecting power to enter IAP—even after an interrupted upgrade.</p>
      </div>
    </section>

    <section v-if="!iapConnected" class="firmware-entry-stage" aria-labelledby="iap-entry-title">
      <div class="firmware-entry-icon" aria-hidden="true"><Usb /></div>
      <span class="eyebrow">WebHID IAP</span>
      <template v-if="permissionRequired">
        <h2 id="iap-entry-title">Reconnect to IAP</h2>
        <p>The controller is in IAP. Give this browser permission to use the newly enumerated “ProShock 4 IAP” interface.</p>
      </template>
      <template v-else-if="configConnected">
        <h2 id="iap-entry-title">Ready to enter IAP</h2>
        <p>The controller will safely leave Configuration Mode, restart, and reconnect through its isolated upgrade interface.</p>
      </template>
      <template v-else>
        <h2 id="iap-entry-title">Select an IAP device</h2>
        <p>Select a controller that is already running in IAP mode.</p>
      </template>

      <p v-if="configurationDirty" class="firmware-warning">Apply and Save or discard configuration changes before entering IAP.</p>
      <p v-if="operationMessage" class="firmware-success">{{ operationMessage }}</p>
      <p v-if="operationError" class="firmware-error" role="alert">{{ operationError }}</p>
      <button
        type="button"
        class="primary firmware-entry-action"
        :disabled="working || configurationDirty"
        @click="permissionRequired ? authorizeIap() : connectIap()"
      >
        <LoaderCircle v-if="working" class="firmware-button-icon spinning" />
        <Usb v-else class="firmware-button-icon" />
        {{ working ? "Connecting…" : configConnected && !permissionRequired ? "Enter IAP" : "Select IAP device" }}
      </button>
      <small>Firmware selection and maintenance actions appear after IAP is connected.</small>
    </section>

    <template v-else>
      <section class="firmware-session-panel">
        <header class="firmware-session-heading">
          <div class="firmware-session-title">
            <span class="firmware-session-icon" aria-hidden="true"><Usb /></span>
            <div><span class="eyebrow">Current session</span><h2>ProShock 4 IAP</h2></div>
          </div>
          <div class="firmware-session-actions">
            <span class="firmware-state-pill success"><i></i>IAP connected</span>
            <button v-if="deviceInfo?.appValid" type="button" :disabled="working" @click="bootExistingApplication">Boot installed firmware</button>
          </div>
        </header>
        <dl v-if="deviceInfo" class="firmware-device-summary">
          <div><dt>Installed firmware</dt><dd>{{ deviceInfo.appValid ? formatVersion(deviceInfo.firmwareVersion) : "Invalid / interrupted" }}</dd></div>
          <div><dt>IAP version</dt><dd>v{{ deviceInfo.iapVersion }}</dd></div>
          <div><dt>Application capacity</dt><dd>{{ formatBytes(deviceInfo.appCapacity) }}</dd></div>
          <div><dt>Recovery state</dt><dd>{{ deviceInfo.appValid ? "Application valid" : "Staying in IAP" }}</dd></div>
        </dl>
      </section>

      <section v-if="!installationStarted" ref="updatePanel" class="firmware-update-panel firmware-install-stage">
        <header>
          <div><span class="eyebrow">Signed package</span><h2>Install firmware</h2></div>
          <span :class="['firmware-state-pill', packageData ? 'success' : 'idle']"><i></i>{{ packageData ? "Verified" : "No file selected" }}</span>
        </header>
        <div class="firmware-update-grid">
          <div class="firmware-package-picker">
            <p>Select a signed ProShock firmware package. Verification and decryption happen locally before IAP erases the application.</p>
            <label class="firmware-file-picker">
              <input hidden type="file" accept=".ps4fw,application/octet-stream" :disabled="working" @change="selectFirmware">
              <UploadCloud aria-hidden="true" />
              <span>{{ fileName || "Choose a .ps4fw file" }}</span>
              <small>{{ packageData ? "Choose a different package" : "Nothing is uploaded to a server" }}</small>
            </label>
            <p v-if="fileError" class="firmware-error" role="alert">{{ fileError }}</p>
          </div>
          <div class="firmware-package-details">
            <div v-if="!packageData" class="firmware-package-empty">
              <ShieldCheck aria-hidden="true" />
              <strong>Waiting for a verified package</strong>
              <span>Ed25519, SHA-512, CRC32, target, and payload range are checked locally.</span>
            </div>
            <dl v-else class="firmware-manifest-grid">
              <div><dt>Version</dt><dd>{{ packageVersion }}</dd></div>
              <div><dt>Target board</dt><dd>CH32V305RBT6</dd></div>
              <div><dt>Payload</dt><dd>{{ formatBytes(packageData.manifest.payloadLength) }}</dd></div>
              <div><dt>Minimum IAP</dt><dd>v{{ packageData.manifest.minimumIapVersion }}</dd></div>
              <div><dt>Key ID</dt><dd>0x{{ packageData.manifest.keyId.toString(16).padStart(8, "0") }}</dd></div>
              <div><dt>Local checks</dt><dd>Ed25519 · SHA-512 · CRC32</dd></div>
            </dl>
          </div>
        </div>
        <footer>
          <span>Bootloader and configuration partitions are protected by IAP.</span>
          <button type="button" class="primary" :disabled="working || !packageData" @click="installFirmware">
            <UploadCloud class="firmware-button-icon" />Install verified firmware
          </button>
        </footer>
      </section>

      <section
        v-else
        class="firmware-progress-panel firmware-install-stage"
        :style="installPanelHeight ? { minHeight: `${installPanelHeight}px` } : undefined"
        aria-live="polite"
      >
        <header><div><span class="eyebrow">Installation status</span><h2>{{ operationTitle }}</h2></div><strong>{{ progressPercent }}%</strong></header>
        <div class="firmware-progress-track"><i :style="{ width: `${progressPercent}%` }"></i></div>
        <div class="firmware-progress-body">
          <div class="firmware-upgrade-caution" role="note">
            <TriangleAlert aria-hidden="true" />
            <div>
              <strong>Do not disconnect USB during the upgrade</strong>
              <p>If USB or power is interrupted, hold <b>PS + Options</b> while reconnecting power to enter IAP and flash the firmware again.</p>
            </div>
          </div>
          <ol class="firmware-phase-list">
            <li v-for="item in phases" :key="item.id" :class="phaseClass(item.id)"><i></i><span>{{ item.label }}</span></li>
          </ol>
          <p v-if="operationMessage" class="firmware-success">{{ operationMessage }}</p>
          <p v-if="operationError" class="firmware-error" role="alert">{{ operationError }}</p>
          <button v-if="operationError && !working" type="button" class="firmware-progress-back" @click="returnToFirmwareSelection">
            Back to firmware selection
          </button>
        </div>
      </section>

      <section class="firmware-reset-panel">
        <div class="firmware-reset-icon" aria-hidden="true"><RotateCcw /></div>
        <div>
          <span class="eyebrow">Configuration recovery</span>
          <h2>Factory Reset</h2>
          <p>Deletes all Profiles, calibration, and settings. Firmware and the IAP bootloader are kept.</p>
        </div>
        <button type="button" class="danger-button" :disabled="working" @click="factoryReset">Erase settings and restore defaults</button>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from "vue";
import {
  LoaderCircle,
  Power,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UploadCloud,
  Usb,
} from "@lucide/vue";
import {
  formatVersion,
  verifyFirmwarePackage,
} from "../firmware-format.js";
import {
  FIRMWARE_SIGNING_KEY_ID,
  FIRMWARE_SIGNING_PUBLIC_KEY,
} from "../firmware-public-key.js";
import { IapHidClient } from "../iap-client.js";
import {
  FirmwareUpdater,
  validateIapCompatibility,
} from "../services/firmware-updater.js";

const props = defineProps({
  configClient: { type: Object, required: true },
  configConnected: { type: Boolean, default: false },
  configurationDirty: { type: Boolean, default: false },
});
const emit = defineEmits(["iap-session"]);

const iapClient = new IapHidClient();
const packageData = ref(null);
const fileName = ref("");
const fileError = ref("");
const deviceInfo = ref(null);
const iapConnected = ref(false);
const iapActive = ref(false);
const permissionRequired = ref(false);
const working = ref(false);
const currentPhase = ref("idle");
const progress = ref({ completed: 0, total: 1 });
const operationMessage = ref("");
const operationError = ref("");
const installationStarted = ref(false);
const updatePanel = ref(null);
const installPanelHeight = ref(0);

const updater = new FirmwareUpdater(iapClient, (nextProgress) => {
  currentPhase.value = nextProgress.phase;
  progress.value = nextProgress;
});

const phases = [
  { id: "manifest", label: "Verify manifest on device" },
  { id: "erase", label: "Erase application pages" },
  { id: "transfer", label: "Send and retransmit chunks" },
  { id: "verify", label: "Verify SHA-512 and CRC32" },
  { id: "reboot", label: "Commit metadata and restart" },
];
const phaseOrder = phases.map((item) => item.id);
const packageVersion = computed(() => packageData.value
  ? formatVersion(packageData.value.manifest.versionCode)
  : "—");
const progressPercent = computed(() => {
  const phaseIndex = phaseOrder.indexOf(currentPhase.value);
  if (phaseIndex < 0) return operationMessage.value ? 100 : 0;
  const withinPhase = progress.value.total
    ? Math.min(1, progress.value.completed / progress.value.total)
    : 0;
  return Math.round(((phaseIndex + withinPhase) / phaseOrder.length) * 100);
});
const operationTitle = computed(() => {
  if (operationError.value) return "Action needs attention";
  if (operationMessage.value) return "Completed";
  if (currentPhase.value === "factory") return "Restoring factory defaults";
  return "Firmware update in progress";
});

function formatBytes(bytes) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(bytes % 1024 ? 1 : 0)} KiB` : `${bytes} B`;
}

function phaseClass(id) {
  const active = phaseOrder.indexOf(currentPhase.value);
  const index = phaseOrder.indexOf(id);
  return {
    active: index === active,
    complete: active > index || (operationMessage.value && index <= active),
  };
}

function setIapActive(active) {
  iapActive.value = active;
  emit("iap-session", active);
}

function resetOperation() {
  operationMessage.value = "";
  operationError.value = "";
  progress.value = { completed: 0, total: 1 };
}

function showInstallationProgress() {
  installPanelHeight.value = Math.ceil(
    updatePanel.value?.getBoundingClientRect().height || 0,
  );
  installationStarted.value = true;
}

function returnToFirmwareSelection() {
  installationStarted.value = false;
  currentPhase.value = "idle";
  resetOperation();
}

async function selectFirmware(event) {
  packageData.value = null;
  fileError.value = "";
  fileName.value = event.target.files?.[0]?.name || "";
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const verified = await verifyFirmwarePackage(
      new Uint8Array(await file.arrayBuffer()),
      FIRMWARE_SIGNING_PUBLIC_KEY,
    );
    if (verified.manifest.keyId !== FIRMWARE_SIGNING_KEY_ID) {
      throw new Error("Firmware key ID does not match the Portal release key.");
    }
    packageData.value = verified;
  } catch (error) {
    fileError.value = error.message;
    event.target.value = "";
  }
}

async function refreshIapInfo() {
  deviceInfo.value = await updater.getInfo();
  iapConnected.value = true;
  return deviceInfo.value;
}

async function connectIap() {
  if (working.value || props.configurationDirty) return null;
  resetOperation();
  working.value = true;
  currentPhase.value = "idle";
  try {
    const fromConfiguration = props.configConnected;
    let device;
    if (fromConfiguration) {
      setIapActive(true);
      device = await updater.enterFromConfig(props.configClient);
      if (!device) {
        permissionRequired.value = true;
        return null;
      }
    } else {
      device = await iapClient.connect({ request: true });
      if (!device) return null;
      setIapActive(true);
    }
    permissionRequired.value = false;
    return await refreshIapInfo();
  } catch (error) {
    operationError.value = error.message;
    return null;
  } finally {
    working.value = false;
  }
}

async function authorizeIap() {
  resetOperation();
  working.value = true;
  try {
    const device = await iapClient.connect({ request: true });
    if (!device) return;
    setIapActive(true);
    permissionRequired.value = false;
    await refreshIapInfo();
  } catch (error) {
    operationError.value = error.message;
  } finally {
    working.value = false;
  }
}

async function ensureIap() {
  if (iapClient.connected && deviceInfo.value) return deviceInfo.value;
  return connectIap();
}

async function finishIapSession() {
  try {
    await iapClient.close();
  } catch {
    // A successful reset removes the IAP interface before close completes.
  }
  iapConnected.value = false;
  permissionRequired.value = false;
  setIapActive(false);
}

async function installFirmware() {
  if (!packageData.value || props.configurationDirty) return;
  resetOperation();
  working.value = true;
  try {
    let info = deviceInfo.value;
    if (!iapClient.connected) {
      working.value = false;
      info = await ensureIap();
      working.value = true;
    }
    if (!info) return;
    const compatibility = validateIapCompatibility(info, packageData.value.manifest);
    if (compatibility.downgrade && !window.confirm(
      `Downgrade ${formatVersion(info.firmwareVersion)} to ${packageVersion.value}?\n\nThe package is signed, but older firmware may remove features or compatibility.`,
    )) return;

    showInstallationProgress();
    currentPhase.value = "manifest";
    progress.value = { completed: 0, total: 1 };
    await updater.install(packageData.value);
    currentPhase.value = "reboot";
    progress.value = { completed: 0, total: 1 };
    await updater.bootApplication();
    progress.value = { completed: 1, total: 1 };
    operationMessage.value = `Firmware ${packageVersion.value} was verified, committed, and started.`;
    await finishIapSession();
  } catch (error) {
    operationError.value = error.message;
  } finally {
    working.value = false;
  }
}

async function bootExistingApplication() {
  resetOperation();
  working.value = true;
  try {
    currentPhase.value = "reboot";
    await updater.bootApplication();
    progress.value = { completed: 1, total: 1 };
    operationMessage.value = "The verified installed firmware was started.";
    await finishIapSession();
  } catch (error) {
    operationError.value = error.message;
  } finally {
    working.value = false;
  }
}

async function factoryReset() {
  if (props.configurationDirty || working.value) return;
  if (!window.confirm("Factory Reset deletes every Profile, calibration, and device setting. Firmware is kept. Continue?")) return;
  if (!window.confirm("Confirm again: erase Config A and Config B and restore defaults on next boot?")) return;
  resetOperation();
  working.value = true;
  try {
    if (!iapClient.connected) {
      working.value = false;
      const info = await ensureIap();
      working.value = true;
      if (!info) return;
    }
    currentPhase.value = "factory";
    await updater.factoryReset();
    operationMessage.value = "Config A and Config B were erased and verified. Default settings will load on startup.";
    await finishIapSession();
  } catch (error) {
    operationError.value = error.message;
  } finally {
    working.value = false;
  }
}

onUnmounted(() => {
  if (!iapActive.value) void iapClient.close();
});
</script>

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as Vue from "vue";
import * as renderer from "vue/server-renderer";
import { compileTemplate, parse } from "@vue/compiler-sfc";
import { FirmwareUpdater } from "./services/firmware-updater.js";

const source = fs.readFileSync(new URL("./pages/FirmwareUpgradePage.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
const compiled = compileTemplate({
  source: descriptor.template.content, filename: "FirmwareUpgradePage.vue", id: "reset-feedback", ssr: true, ssrCssVars: [],
});
assert.deepEqual(compiled.errors, []);
const renderSource = compiled.code
  .replace(/import \{([^}]+)\} from "([^"]+)"/g, (_, names, module) =>
    `const {${names.replace(/\s+as\s+/g, ": ")}} = ${module === "vue" ? "Vue" : "renderer"};`)
  .replace("export function ssrRender", "function ssrRender");
const ssrRender = vm.runInNewContext(renderSource + "\nssrRender", { Vue, renderer });
const setupSource = descriptor.scriptSetup.content.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");

/** @brief Execute real maintenance handlers against simulated IAP replies, without USB. */
function harness(failCommand = -1, status = 0) {
  const calls = [];
  class FakeClient {
    connected = true;
    async sendCommand(command) {
      calls.push(command);
      return { status: command === failCommand ? status : 0, payload: command === 0x10 ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array() };
    }
    async close() { this.connected = false; }
  }
  const props = { configConnected: false, configurationDirty: false };
  const context = vm.createContext({
    computed: Vue.computed, ref: Vue.ref, onUnmounted: () => {},
    defineProps: () => props, defineEmits: () => () => {}, IapHidClient: FakeClient, FirmwareUpdater,
    window: { confirm: () => true }, formatVersion: () => "1.0.0",
  });
  const api = vm.runInContext(setupSource + `\n({ factoryReset, restartAfterFactoryReset, iapConnected, installationStarted,
    working, operationError, operationMessage, factoryResetMessage, factoryResetAwaitingChoice,
    permissionRequired, deviceInfo, packageData, fileName, fileError, installPanelHeight,
    currentPhase, phases, phaseClass, progressPercent, operationTitle, formatBytes, packageVersion })`, context);
  api.iapConnected.value = true;
  api.deviceInfo.value = { appValid: true, firmwareVersion: 1, iapVersion: 1, appCapacity: 90112 };
  return { api, props, calls };
}

/** @brief Render the actual page template, including its IAP/installation branches. */
async function renderPage({ api, props }) {
  const icon = { render: () => null };
  const app = Vue.createSSRApp({
    setup: () => ({ ...api, ...props, formatVersion: () => "1.0.0" }), ssrRender,
    components: Object.fromEntries(["Power", "Usb", "LoaderCircle", "UploadCloud", "ShieldCheck", "TriangleAlert", "RotateCcw"].map((name) => [name, icon])),
  });
  return renderer.renderToString(app);
}

for (const [command, status, label] of [[0x10, 1, "FACTORY_RESET_PREPARE"], [0x11, 10, "FACTORY_RESET_CONFIRM"]]) {
  test(`${label} failure is rendered once while connected without starting an installation`, async () => {
    const h = harness(command, status);
    await h.api.factoryReset();
    const html = await renderPage(h);
    assert.match(html, new RegExp(`role="alert">${label} failed with IAP status 0x${status.toString(16)}\\.`));
    assert.equal((html.match(/role="alert"/g) || []).length, 1);
    assert.equal(h.api.working.value, false);
    assert.equal(h.api.factoryResetAwaitingChoice.value, false);
    assert.deepEqual(h.calls, command === 0x10 ? [0x10] : [0x10, 0x11]);
  });
}

test("installation and disconnected branches still display one error", async () => {
  const h = harness(0x11, 10);
  await h.api.factoryReset();
  for (const [connected, started] of [[true, true], [false, false]]) {
    h.api.iapConnected.value = connected;
    h.api.installationStarted.value = started;
    const html = await renderPage(h);
    assert.equal((html.match(/role="alert"/g) || []).length, 1);
    assert.match(html, /FACTORY_RESET_CONFIRM failed/);
  }
});

test("successful erase shows choices without booting, and restart clears a previous error", async () => {
  const h = harness();
  await h.api.factoryReset();
  assert.deepEqual(h.calls, [0x10, 0x11]);
  const html = await renderPage(h);
  assert.match(html, /Restart controller/);
  assert.doesNotMatch(html, /role="alert"/);
  h.api.operationError.value = "Previous restart failed";
  await h.api.restartAfterFactoryReset();
  assert.equal(h.api.operationError.value, "");
  assert.equal(h.api.iapConnected.value, false);
});

test("restart failure is visible next to the connected maintenance controls", async () => {
  const h = harness(0x0a, 14);
  h.api.factoryResetAwaitingChoice.value = true;
  await h.api.restartAfterFactoryReset();
  assert.match(await renderPage(h), /role="alert">BOOT_APP failed with IAP status 0xe\./);
  assert.equal(h.api.factoryResetAwaitingChoice.value, true);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("./pages/FirmwareUpgradePage.vue", import.meta.url),
  "utf8",
);

test("firmware tools render only after the IAP connection gate", () => {
  const entryIndex = pageSource.indexOf('<section v-if="!iapConnected"');
  const workspaceIndex = pageSource.indexOf("<template v-else>", entryIndex);
  const packageInputIndex = pageSource.indexOf('accept=".ps4fw');
  const factoryResetIndex = pageSource.indexOf("Erase settings and restore defaults");

  assert.ok(entryIndex >= 0, "IAP entry gate must be present");
  assert.ok(workspaceIndex > entryIndex, "IAP workspace must be the connected branch");
  assert.ok(packageInputIndex > workspaceIndex, "firmware picker must stay behind the gate");
  assert.ok(factoryResetIndex > workspaceIndex, "Factory Reset must stay behind the gate");
});

test("IAP entry offers software entry or device selection without waiting copy", () => {
  assert.match(
    pageSource,
    /configConnected && !permissionRequired \? "Enter IAP" : "Select IAP device"/,
  );
  assert.doesNotMatch(pageSource, /Waiting for an IAP device/);
  assert.doesNotMatch(pageSource, /Older devices need WCH-Link/);
});

test("install card is replaced in place by a same-height progress warning", () => {
  assert.match(
    pageSource,
    /v-if="!installationStarted" ref="updatePanel" class="firmware-update-panel firmware-install-stage"/,
  );
  assert.match(
    pageSource,
    /v-else\s+class="firmware-progress-panel firmware-install-stage"/,
  );
  assert.match(pageSource, /getBoundingClientRect\(\)\.height/);
  assert.match(pageSource, /Do not disconnect USB during the upgrade/);
  assert.match(pageSource, /hold <b>PS \+ Options<\/b>/);
});

test("factory reset lets the user restart or remain in IAP", () => {
  assert.match(pageSource, />Stay in IAP<\/button>/);
  assert.match(pageSource, />Restart controller<\/button>/);
  assert.match(pageSource, /factoryResetAwaitingChoice\.value = true/);
  assert.match(pageSource, /async function restartAfterFactoryReset\(\)/);
  assert.doesNotMatch(
    pageSource,
    /await updater\.factoryReset\(\);[\s\S]{0,160}await finishIapSession\(\)/,
  );
});

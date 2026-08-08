import test from "node:test";
import assert from "node:assert/strict";
import { APP_CAPACITY, TARGET_BOARD_ID } from "../firmware-format.js";
import { FIRMWARE_SIGNING_KEY_ID } from "../firmware-public-key.js";
import { IAP_COMMAND, IAP_STATUS } from "../iap-client.js";
import {
  FirmwareUpdater,
  validateIapCompatibility,
} from "./firmware-updater.js";

globalThis.window = globalThis;

function response(status = IAP_STATUS.OK, payload = new Uint8Array()) {
  return { status, payload };
}

function validInfo(overrides = {}) {
  return {
    targetBoardId: TARGET_BOARD_ID,
    appCapacity: APP_CAPACITY,
    iapVersion: 1,
    appValid: true,
    keyId: FIRMWARE_SIGNING_KEY_ID,
    firmwareVersion: 0x00020000,
    ...overrides,
  };
}

function validManifest(overrides = {}) {
  return {
    payloadLength: 64,
    minimumIapVersion: 1,
    keyId: FIRMWARE_SIGNING_KEY_ID,
    versionCode: 0x00010000,
    ...overrides,
  };
}

test("compatibility rejects target, capacity, IAP, or signing-key mismatch", () => {
  assert.equal(validateIapCompatibility(validInfo(), validManifest()).downgrade, true);
  assert.throws(() => validateIapCompatibility(validInfo({ targetBoardId: 1 }), validManifest()), /different board/);
  assert.throws(() => validateIapCompatibility(validInfo({ appCapacity: 32 }), validManifest()), /does not fit/);
  assert.throws(() => validateIapCompatibility(validInfo({ iapVersion: 0 }), validManifest()), /too old/);
  assert.throws(() => validateIapCompatibility(validInfo({ keyId: 1 }), validManifest()), /signing key/);
});

test("page retry erases only the affected page and restarts its chunks", async () => {
  const writes = [];
  let firstWrite = true;
  const client = {
    async sendCommand(command, payload) {
      if (command === IAP_COMMAND.WRITE_CHUNK) {
        const offset = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true);
        writes.push(offset);
        if (firstWrite) {
          firstWrite = false;
          return response(IAP_STATUS.PAGE_RETRY);
        }
      }
      if (command === IAP_COMMAND.GET_BITMAP) {
        return response(IAP_STATUS.OK, new Uint8Array([0, 0, 2, 0, 3]));
      }
      return response();
    },
  };
  const updater = new FirmwareUpdater(client);
  await updater.transfer(new Uint8Array(64));
  assert.deepEqual(writes, [0, 0, 32]);
});

test("bitmap recovery sends chunks reported missing after the main pass", async () => {
  const writes = [];
  let bitmapRead = false;
  const client = {
    async sendCommand(command, payload) {
      if (command === IAP_COMMAND.WRITE_CHUNK) {
        writes.push(new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true));
      }
      if (command === IAP_COMMAND.GET_BITMAP) {
        bitmapRead = true;
        return response(IAP_STATUS.OK, new Uint8Array([0, 0, 2, 0, 1]));
      }
      return response();
    },
  };
  await new FirmwareUpdater(client).transfer(new Uint8Array(64));
  assert.equal(bitmapRead, true);
  assert.deepEqual(writes, [0, 32, 32]);
});

test("factory reset echoes the device challenge and fixed confirmation", async () => {
  const calls = [];
  const client = {
    async sendCommand(command, payload = new Uint8Array()) {
      calls.push({ command, payload: [...payload] });
      if (command === IAP_COMMAND.FACTORY_RESET_PREPARE) {
        return response(IAP_STATUS.OK, new Uint8Array([0x78, 0x56, 0x34, 0x12]));
      }
      return response();
    },
  };
  await new FirmwareUpdater(client).factoryReset();
  assert.equal(calls[1].command, IAP_COMMAND.FACTORY_RESET_CONFIRM);
  assert.deepEqual(calls[1].payload.slice(0, 4), [0x78, 0x56, 0x34, 0x12]);
  assert.equal(new TextDecoder().decode(new Uint8Array(calls[1].payload.slice(4))), "RESETCFG");
});

test("IAP entry tolerates reset racing the permanent WebHID close", async () => {
  const configClient = {
    transitioning: false,
    async sendCommand() { return { status: 0 }; },
    async close() { throw new Error("device disappeared"); },
  };
  const iapDevice = { productName: "ProShock 4 IAP" };
  const updater = new FirmwareUpdater({ async waitForDevice() { return iapDevice; } });
  assert.equal(await updater.enterFromConfig(configClient), iapDevice);
  assert.equal(configClient.transitioning, false);
});

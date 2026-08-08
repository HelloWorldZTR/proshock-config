import {
  MANIFEST_SIZE,
  TARGET_BOARD_ID,
  TRANSFER_CHUNK_SIZE,
  crc16Ccitt,
  formatVersion,
} from "../firmware-format.js";
import { IAP_COMMAND, IAP_STATUS } from "../iap-client.js";
import { COMMAND, ENTER_IAP_PAYLOAD } from "../protocol.js";
import { FIRMWARE_SIGNING_KEY_ID } from "../firmware-public-key.js";

const IAP_STATE_READY = 3;
const IAP_STATE_ERROR = 7;
const PAGE_CHUNKS = 4096 / TRANSFER_CHUNK_SIZE;
const ERASE_TIMEOUT_MS = 30000;

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function requireOk(response, operation, allowed = []) {
  if (response.status !== IAP_STATUS.OK && !allowed.includes(response.status)) {
    throw new Error(`${operation} failed with IAP status 0x${response.status.toString(16)}.`);
  }
  return response;
}

export function parseIapInfo(payload) {
  if (payload.byteLength < 24) throw new Error("IAP information response is truncated.");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    targetBoardId: view.getUint32(0, true),
    appBase: view.getUint32(4, true),
    appCapacity: view.getUint32(8, true),
    iapVersion: payload[12],
    state: payload[13],
    appValid: !!payload[14],
    keyId: view.getUint32(16, true),
    firmwareVersion: view.getUint32(20, true),
  };
}

export function validateIapCompatibility(info, manifest) {
  if (info.targetBoardId !== TARGET_BOARD_ID) {
    throw new Error("Connected IAP targets a different board.");
  }
  if (info.keyId !== FIRMWARE_SIGNING_KEY_ID || manifest.keyId !== info.keyId) {
    throw new Error("Firmware signing key does not match this bootloader.");
  }
  if (info.appCapacity < manifest.payloadLength) {
    throw new Error("Firmware does not fit this device.");
  }
  if (info.iapVersion < manifest.minimumIapVersion) {
    throw new Error("IAP bootloader is too old for this package.");
  }
  return {
    downgrade: info.appValid && manifest.versionCode < info.firmwareVersion,
  };
}

export class FirmwareUpdater {
  constructor(iapClient, onProgress = () => {}) {
    this.client = iapClient;
    this.onProgress = onProgress;
  }

  async enterFromConfig(configClient) {
    configClient.transitioning = true;
    try {
      const response = await configClient.sendCommand(COMMAND.ENTER_IAP, ENTER_IAP_PAYLOAD);
      if (response.status !== 0) throw new Error("Firmware rejected the IAP entry request.");
      try {
        await configClient.close();
      } catch {
        // The application normally resets before WebHID close can complete.
      }
      return await this.client.waitForDevice();
    } finally {
      configClient.transitioning = false;
    }
  }

  async getInfo() {
    const response = requireOk(await this.client.sendCommand(IAP_COMMAND.GET_INFO), "GET_INFO");
    return parseIapInfo(response.payload);
  }

  async sendManifest(manifestBytes) {
    requireOk(await this.client.sendCommand(IAP_COMMAND.MANIFEST_BEGIN), "MANIFEST_BEGIN");
    for (let offset = 0; offset < MANIFEST_SIZE; offset += 52) {
      const data = manifestBytes.slice(offset, Math.min(offset + 52, MANIFEST_SIZE));
      const payload = new Uint8Array(4 + data.byteLength);
      const view = new DataView(payload.buffer);
      view.setUint16(0, offset, true);
      view.setUint16(2, data.byteLength, true);
      payload.set(data, 4);
      requireOk(await this.client.sendCommand(IAP_COMMAND.MANIFEST_CHUNK, payload), "MANIFEST_CHUNK");
    }
    requireOk(await this.client.sendCommand(IAP_COMMAND.MANIFEST_COMMIT), "MANIFEST_COMMIT");
  }

  async waitUntilReady() {
    const deadline = Date.now() + ERASE_TIMEOUT_MS;
    for (;;) {
      const response = requireOk(await this.client.sendCommand(IAP_COMMAND.GET_STATUS), "GET_STATUS");
      const state = response.payload[0];
      const erased = response.payload[1];
      const total = response.payload[2];
      this.onProgress({ phase: "erase", completed: erased, total });
      if (state === IAP_STATE_READY) return;
      if (state === IAP_STATE_ERROR) throw new Error("IAP flash erase failed.");
      if (Date.now() >= deadline) throw new Error("Timed out while erasing the application partition.");
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }

  makeWritePayload(ciphertext, chunkIndex) {
    const offset = chunkIndex * TRANSFER_CHUNK_SIZE;
    const data = ciphertext.slice(offset, Math.min(offset + TRANSFER_CHUNK_SIZE, ciphertext.byteLength));
    const payload = new Uint8Array(8 + data.byteLength);
    const view = new DataView(payload.buffer);
    view.setUint32(0, offset, true);
    view.setUint16(4, data.byteLength, true);
    view.setUint16(6, crc16Ccitt(data), true);
    payload.set(data, 8);
    return payload;
  }

  async sendChunk(ciphertext, chunkIndex) {
    const response = await this.client.sendCommand(
      IAP_COMMAND.WRITE_CHUNK,
      this.makeWritePayload(ciphertext, chunkIndex),
    );
    return requireOk(response, "WRITE_CHUNK", [IAP_STATUS.PAGE_RETRY]);
  }

  async missingChunks(totalChunks) {
    const missing = [];
    for (let start = 0; start < totalChunks; start += 416) {
      const response = requireOk(
        await this.client.sendCommand(IAP_COMMAND.GET_BITMAP, u16(start)),
        "GET_BITMAP",
      );
      const view = new DataView(response.payload.buffer, response.payload.byteOffset, response.payload.byteLength);
      const returnedStart = view.getUint16(0, true);
      const count = view.getUint16(2, true);
      for (let index = 0; index < count; index += 1) {
        if (!(response.payload[4 + (index >>> 3)] & (1 << (index & 7)))) {
          missing.push(returnedStart + index);
        }
      }
    }
    return missing;
  }

  async transfer(ciphertext) {
    const totalChunks = Math.ceil(ciphertext.byteLength / TRANSFER_CHUNK_SIZE);
    let chunkIndex = 0;
    while (chunkIndex < totalChunks) {
      const response = await this.sendChunk(ciphertext, chunkIndex);
      if (response.status === IAP_STATUS.PAGE_RETRY) {
        const page = Math.floor(chunkIndex / PAGE_CHUNKS);
        requireOk(await this.client.sendCommand(IAP_COMMAND.RETRY_PAGE, u16(page)), "RETRY_PAGE");
        chunkIndex = page * PAGE_CHUNKS;
        continue;
      }
      chunkIndex += 1;
      this.onProgress({ phase: "transfer", completed: chunkIndex, total: totalChunks });
    }
    for (const missing of await this.missingChunks(totalChunks)) {
      requireOk(await this.sendChunk(ciphertext, missing), "WRITE_CHUNK");
    }
  }

  async install(packageData) {
    const info = await this.getInfo();
    validateIapCompatibility(info, packageData.manifest);
    await this.sendManifest(packageData.manifestBytes);
    await this.waitUntilReady();
    await this.transfer(packageData.ciphertext);
    this.onProgress({ phase: "verify", completed: 0, total: 1 });
    requireOk(await this.client.sendCommand(IAP_COMMAND.FINALIZE, new Uint8Array(), { timeoutMs: 15000 }), "FINALIZE");
    this.onProgress({ phase: "verify", completed: 1, total: 1 });
    return { info, version: formatVersion(packageData.manifest.versionCode) };
  }

  async bootApplication() {
    requireOk(await this.client.sendCommand(IAP_COMMAND.BOOT_APP), "BOOT_APP");
  }

  async factoryReset() {
    const prepared = requireOk(
      await this.client.sendCommand(IAP_COMMAND.FACTORY_RESET_PREPARE),
      "FACTORY_RESET_PREPARE",
    );
    if (prepared.payload.byteLength !== 4) throw new Error("Factory reset challenge is invalid.");
    const payload = new Uint8Array(12);
    payload.set(prepared.payload, 0);
    payload.set(new TextEncoder().encode("RESETCFG"), 4);
    requireOk(
      await this.client.sendCommand(IAP_COMMAND.FACTORY_RESET_CONFIRM, payload, { timeoutMs: 15000 }),
      "FACTORY_RESET_CONFIRM",
    );
  }
}

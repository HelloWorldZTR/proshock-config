import { IAP_FILTERS, PACKET_SIZE } from "./protocol.js";

export const IAP_COMMAND = Object.freeze({
  GET_INFO: 0x01,
  MANIFEST_BEGIN: 0x02,
  MANIFEST_CHUNK: 0x03,
  MANIFEST_COMMIT: 0x04,
  GET_STATUS: 0x05,
  WRITE_CHUNK: 0x06,
  GET_BITMAP: 0x07,
  RETRY_PAGE: 0x08,
  FINALIZE: 0x09,
  BOOT_APP: 0x0a,
  ABORT: 0x0b,
  FACTORY_RESET_PREPARE: 0x10,
  FACTORY_RESET_CONFIRM: 0x11,
});

export const IAP_STATUS = Object.freeze({
  OK: 0x00,
  BUSY: 0x01,
  PAGE_RETRY: 0x0d,
});

const IAP_USAGE_PAGE = 0xff01;
const IAP_USAGE = 0x01;
const RECONNECT_TIMEOUT_MS = 15000;

export function hasIapCollection(device) {
  return device.collections.some((collection) => (
    collection.usagePage === IAP_USAGE_PAGE && collection.usage === IAP_USAGE
  ));
}

export function encodeIapPacket(command, sequence, payload = new Uint8Array()) {
  if (payload.byteLength > 56) throw new Error("IAP payload exceeds 56 bytes.");
  const packet = new Uint8Array(PACKET_SIZE);
  const view = new DataView(packet.buffer);
  packet[0] = 1;
  packet[1] = command;
  view.setUint16(4, payload.byteLength, true);
  view.setUint16(6, sequence, true);
  packet.set(payload, 8);
  return packet;
}

export function decodeIapPacket(bytes) {
  if (bytes.byteLength !== PACKET_SIZE) throw new Error("Unexpected IAP packet size.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadLength = view.getUint16(4, true);
  if (payloadLength > 56) throw new Error("Unexpected IAP payload length.");
  return {
    version: bytes[0],
    command: bytes[1],
    status: bytes[2],
    flags: bytes[3],
    payloadLength,
    sequence: view.getUint16(6, true),
    payload: bytes.slice(8, 8 + payloadLength),
  };
}

export class IapHidClient {
  constructor() {
    this.device = null;
    this.pending = null;
    this.sequence = 1;
    this.onInputReport = this.onInputReport.bind(this);
  }

  get connected() {
    return !!this.device?.opened;
  }

  async findAuthorizedDevice() {
    if (!("hid" in navigator)) return null;
    return (await navigator.hid.getDevices()).find(hasIapCollection) || null;
  }

  async connect({ request = true } = {}) {
    if (!("hid" in navigator)) throw new Error("This browser does not support WebHID.");
    let device = await this.findAuthorizedDevice();
    if (!device && request) {
      const selected = await navigator.hid.requestDevice({ filters: IAP_FILTERS });
      device = selected.find(hasIapCollection) || null;
    }
    if (!device) return null;
    await this.open(device);
    return device;
  }

  async waitForDevice(timeoutMs = RECONNECT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const device = await this.findAuthorizedDevice();
      if (device) {
        await this.open(device);
        return device;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return null;
  }

  async open(device) {
    if (this.device) this.device.removeEventListener("inputreport", this.onInputReport);
    this.device = device;
    if (!device.opened) await device.open();
    device.addEventListener("inputreport", this.onInputReport);
  }

  onInputReport(event) {
    if (!this.pending) return;
    try {
      const packet = decodeIapPacket(new Uint8Array(
        event.data.buffer,
        event.data.byteOffset,
        event.data.byteLength,
      ));
      if (packet.command !== this.pending.command || packet.sequence !== this.pending.sequence) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timeoutId);
      pending.resolve(packet);
    } catch (error) {
      this.rejectPending(error);
    }
  }

  rejectPending(error) {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }

  async sendCommand(command, payload = new Uint8Array(), { retries = 3, timeoutMs = 5000 } = {}) {
    if (!this.connected) throw new Error("IAP device is not connected.");
    if (this.pending) throw new Error("Another IAP request is in flight.");
    const sequence = this.sequence;
    this.sequence = (this.sequence + 1) & 0xffff;
    if (!this.sequence) this.sequence = 1;
    const bytes = encodeIapPacket(command, sequence, payload);
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const response = await new Promise((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            this.rejectPending(new Error("Timed out waiting for IAP response."));
          }, timeoutMs);
          this.pending = { command, sequence, resolve, reject, timeoutId };
          this.device.sendReport(0, bytes).catch((error) => this.rejectPending(error));
        });
        return response;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async close() {
    this.rejectPending(new Error("IAP session closed."));
    if (!this.device) return;
    this.device.removeEventListener("inputreport", this.onInputReport);
    if (this.device.opened) await this.device.close();
    this.device = null;
  }
}

import {
  COMMAND,
  CONFIG_ENTRY_PAYLOAD,
  CONFIG_ENTRY_REPORT_ID,
  FILTERS,
  PACKET_SIZE,
  decodePacket,
  encodePacket,
} from "./protocol.js";

const CONFIG_RECONNECT_TIMEOUT_MS = 9000;
const CONFIG_RECONNECT_POLL_MS = 100;

function hasCollection(candidate, usagePage, usage) {
  return candidate.collections.some((collection) =>
    collection.usagePage === usagePage && collection.usage === usage);
}

export function hasConfigCollection(candidate) {
  return hasCollection(candidate, 0xff00, 0x01);
}

export function hasNormalEntryCollection(candidate) {
  return hasCollection(candidate, 0xfff0, 0x40);
}

export class WebHidClient {
  constructor() {
    this.device = null;
    this.pending = null;
    this.transitioning = false;
    this.onInputReport = this.onInputReport.bind(this);
  }

  get connected() {
    return !!(this.device && this.device.opened);
  }

  get busy() {
    return !!this.pending;
  }

  async connect() {
    if (!("hid" in navigator)) {
      throw new Error("This browser does not support WebHID.");
    }

    const devices = await navigator.hid.requestDevice({ filters: FILTERS });
    if (!devices.length) {
      return null;
    }

    if (this.device) {
      this.device.removeEventListener("inputreport", this.onInputReport);
    }

    const selected = devices.find(hasConfigCollection)
      || devices.find(hasNormalEntryCollection)
      || devices[0];
    if (hasConfigCollection(selected)) {
      await this.openConfigDevice(selected);
      return this.device;
    }

    if (!hasNormalEntryCollection(selected)) {
      throw new Error("The selected controller does not expose the configuration entry report.");
    }

    this.transitioning = true;
    this.device = selected;
    if (!selected.opened) await selected.open();
    await selected.sendFeatureReport(CONFIG_ENTRY_REPORT_ID, CONFIG_ENTRY_PAYLOAD);

    try {
      const configDevice = await this.waitForConfigDevice();
      await this.openConfigDevice(configDevice);
      return this.device;
    } finally {
      this.transitioning = false;
    }
  }

  async openConfigDevice(device) {
    if (this.device) {
      this.device.removeEventListener("inputreport", this.onInputReport);
    }
    this.device = device;
    if (!device.opened) await device.open();
    device.addEventListener("inputreport", this.onInputReport);
  }

  async waitForConfigDevice(timeoutMs = CONFIG_RECONNECT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const devices = await navigator.hid.getDevices();
      const configDevice = devices.find(hasConfigCollection);
      if (configDevice) return configDevice;
      await new Promise((resolve) => window.setTimeout(
        resolve,
        CONFIG_RECONNECT_POLL_MS,
      ));
    }
    throw new Error("The controller did not reconnect in configuration mode. It will return to Gaming Mode automatically.");
  }

  onInputReport(event) {
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    if (data.byteLength !== PACKET_SIZE || !this.pending) {
      return;
    }

    try {
      const packet = decodePacket(data);
      const active = this.pending;
      if (packet.command !== active.command) {
        this.rejectPending(new Error(
          `Unexpected WebHID response 0x${packet.command.toString(16)} while waiting for 0x${active.command.toString(16)}.`,
        ));
        return;
      }
      this.pending = null;
      clearTimeout(active.timeoutId);
      active.resolve(packet);
    } catch (error) {
      this.rejectPending(error);
    }
  }

  rejectPending(error) {
    if (!this.pending) {
      return;
    }

    const active = this.pending;
    this.pending = null;
    clearTimeout(active.timeoutId);
    active.reject(error);
  }

  async sendCommand(command, payload = new Uint8Array()) {
    if (!this.connected) {
      throw new Error("Device is not connected.");
    }

    if (this.pending) {
      throw new Error("Another request is already in flight.");
    }

    const packet = encodePacket(command, payload);
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.rejectPending(new Error("Timed out waiting for WebHID response."));
      }, 5000);

      this.pending = { command, resolve, reject, timeoutId };
      this.device.sendReport(0, packet).catch((error) => {
        this.rejectPending(error);
      });
    });
  }

  sendBestEffortExit() {
    if (!this.connected || this.pending) return;
    const packet = encodePacket(COMMAND.EXIT_CONFIG);
    void this.device.sendReport(0, packet).catch(() => {});
  }

  async close() {
    this.rejectPending(new Error("Configuration session closed."));
    if (!this.device) return;
    this.device.removeEventListener("inputreport", this.onInputReport);
    if (this.device.opened) await this.device.close();
    this.device = null;
  }
}

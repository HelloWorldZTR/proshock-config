import { decodePacket, encodePacket, FILTERS, PACKET_SIZE } from "./protocol.js";

function hasConfigCollection(candidate) {
  return candidate.collections.some((collection) =>
    collection.usagePage === 0xff00 && collection.usage === 0x01);
}

export class WebHidClient {
  constructor() {
    this.device = null;
    this.pending = null;
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

    this.device = devices.find(hasConfigCollection) || devices[0];
    if (!this.device.opened) {
      await this.device.open();
    }

    this.device.addEventListener("inputreport", this.onInputReport);
    return this.device;
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
}

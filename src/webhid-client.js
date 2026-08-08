import {
  CONFIG_FILTERS,
  CONFIG_PACKET_SIZE,
  CONFIG_REPORT_ID,
  decodePacket,
  encodePacket,
} from "./protocol.js";

const RESPONSE_TIMEOUT_MS = 5000;
const RESPONSE_RETRIES = 3;
const BUSY_POLL_MS = 8;

function collectionHasFeatureReport(collection, reportId) {
  return (collection.featureReports || []).some((report) => report.reportId === reportId)
    || (collection.children || []).some((child) =>
      collectionHasFeatureReport(child, reportId));
}

export function hasConfigFeatureReport(candidate) {
  return (candidate.collections || []).some((collection) =>
    collectionHasFeatureReport(collection, CONFIG_REPORT_ID));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout(promise, milliseconds) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Timed out waiting for WebHID response."));
    }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function featureBytes(data) {
  let bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if(bytes.byteLength === (CONFIG_PACKET_SIZE + 1) && bytes[0] === CONFIG_REPORT_ID) {
    bytes = bytes.slice(1);
  }
  return bytes;
}

export class WebHidClient {
  constructor() {
    this.device = null;
    this.pending = null;
    this.transitioning = false;
    this.sequence = 1;
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

    const devices = await navigator.hid.requestDevice({ filters: CONFIG_FILTERS });
    if (!devices.length) {
      return null;
    }

    const selected = devices.find(hasConfigFeatureReport);
    if (!selected) {
      throw new Error("The selected controller does not expose configuration Feature Report 0xF0.");
    }
    await this.openConfigDevice(selected);
    return this.device;
  }

  async openConfigDevice(device) {
    this.device = device;
    if (!device.opened) await device.open();
  }

  async sendCommand(command, payload = new Uint8Array(), {
    retries = RESPONSE_RETRIES,
    timeoutMs = RESPONSE_TIMEOUT_MS,
  } = {}) {
    if (!this.connected) {
      throw new Error("Device is not connected.");
    }

    if (this.pending) {
      throw new Error("Another request is already in flight.");
    }

    const transactionId = this.sequence;
    this.sequence = (this.sequence + 1) & 0xffff;
    if (!this.sequence) this.sequence = 1;
    const active = { command, transactionId, error: null };
    const bytes = encodePacket(command, payload, transactionId);
    let lastError = new Error("Timed out waiting for WebHID response.");
    this.pending = active;

    try {
      for (let attempt = 0; attempt < retries; attempt += 1) {
        const deadline = Date.now() + timeoutMs;
        try {
          await withTimeout(
            this.device.sendFeatureReport(CONFIG_REPORT_ID, bytes),
            timeoutMs,
          );

          while (true) {
            if (active.error) throw active.error;
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
              throw new Error("Timed out waiting for WebHID response.");
            }

            const data = await withTimeout(
              this.device.receiveFeatureReport(CONFIG_REPORT_ID),
              remaining,
            );
            if (active.error) throw active.error;
            const response = decodePacket(featureBytes(data));

            /* Reading drains an older response; resubmit this transaction. */
            if (response.transactionId !== transactionId) {
              if (response.status === 0x01) {
                await delay(BUSY_POLL_MS);
                continue;
              }
              lastError = new Error(
                `Drained stale WebHID transaction ${response.transactionId} while waiting for ${transactionId}.`,
              );
              break;
            }
            if (response.protocolVersion !== bytes[0]) {
              throw new Error(`Unexpected WebHID protocol version ${response.protocolVersion}.`);
            }
            if (response.status === 0x01) {
              await delay(BUSY_POLL_MS);
              continue;
            }
            if (response.command !== command) {
              throw new Error(
                `Unexpected WebHID response 0x${response.command.toString(16)} while waiting for 0x${command.toString(16)}.`,
              );
            }
            return response;
          }
        } catch (error) {
          lastError = error;
        }

        if (attempt + 1 < retries) {
          await delay(BUSY_POLL_MS);
        }
      }
      throw lastError;
    } finally {
      if (this.pending === active) this.pending = null;
    }
  }

  async close() {
    if (this.pending) {
      this.pending.error = new Error("WebHID connection closed.");
    }
    if (!this.device) return;
    if (this.device.opened) await this.device.close();
    this.device = null;
  }
}

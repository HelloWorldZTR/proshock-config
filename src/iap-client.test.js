import test from "node:test";
import assert from "node:assert/strict";
import {
  IAP_COMMAND,
  IapHidClient,
  decodeIapPacket,
  encodeIapPacket,
  hasIapCollection,
} from "./iap-client.js";

globalThis.window = globalThis;

function fakeIapDevice(onSend) {
  const listeners = new Map();
  return {
    opened: true,
    collections: [{ usagePage: 0xff01, usage: 0x01 }],
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
    async sendReport(reportId, bytes) {
      assert.equal(reportId, 0);
      await onSend(bytes, listeners);
    },
    async close() { this.opened = false; },
  };
}

test("IAP packets preserve command, sequence, and payload", () => {
  const encoded = encodeIapPacket(IAP_COMMAND.WRITE_CHUNK, 0x1234, new Uint8Array([1, 2, 3]));
  encoded[2] = 0x0d;
  const decoded = decodeIapPacket(encoded);
  assert.equal(decoded.command, IAP_COMMAND.WRITE_CHUNK);
  assert.equal(decoded.sequence, 0x1234);
  assert.equal(decoded.status, 0x0d);
  assert.deepEqual([...decoded.payload], [1, 2, 3]);
});

test("IAP collection detection excludes configuration interfaces", () => {
  assert.equal(hasIapCollection({ collections: [{ usagePage: 0xff01, usage: 1 }] }), true);
  assert.equal(hasIapCollection({ collections: [{ usagePage: 0xff00, usage: 1 }] }), false);
});

test("timed-out IAP retries reuse the same sequence", async () => {
  const sequences = [];
  let sends = 0;
  const client = new IapHidClient();
  const device = fakeIapDevice(async (bytes, listeners) => {
    sends += 1;
    const request = decodeIapPacket(bytes);
    sequences.push(request.sequence);
    if (sends === 3) {
      const response = encodeIapPacket(request.command, request.sequence);
      queueMicrotask(() => listeners.get("inputreport")({ data: new DataView(response.buffer) }));
    }
  });
  await client.open(device);
  const response = await client.sendCommand(IAP_COMMAND.GET_INFO, new Uint8Array(), {
    retries: 3,
    timeoutMs: 2,
  });
  assert.equal(response.status, 0);
  assert.equal(sends, 3);
  assert.deepEqual(sequences, [1, 1, 1]);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONFIG_FILTERS,
  CONFIG_PACKET_SIZE,
  CONFIG_REPORT_ID,
  decodePacket,
  encodePacket,
} from "./protocol.js";
import {
  WebHidClient,
  hasConfigFeatureReport,
} from "./webhid-client.js";

function mockDevice(collections, opened = false) {
  return {
    collections,
    opened,
    async open() { this.opened = true; },
    async close() { this.opened = false; },
  };
}

test("V2 configuration packets keep 56 payload bytes inside one 63-byte report", () => {
  const payload = new Uint8Array(56).map((_, index) => index);
  const encoded = encodePacket(0x06, payload, 0x1234);
  const decoded = decodePacket(encoded);
  assert.equal(encoded.byteLength, 63);
  assert.equal(decoded.protocolVersion, 2);
  assert.equal(decoded.transactionId, 0x1234);
  assert.deepEqual(Array.from(decoded.payload), Array.from(payload));
});

test("only a controller declaring Feature Report 0xF0 is configurable", () => {
  const config = mockDevice([{
    usagePage: 0x01,
    usage: 0x05,
    featureReports: [{ reportId: CONFIG_REPORT_ID }],
  }]);
  const gamepad = mockDevice([{
    usagePage: 0x01,
    usage: 0x05,
    featureReports: [{ reportId: 0x02 }],
  }]);
  assert.equal(hasConfigFeatureReport(config), true);
  assert.equal(hasConfigFeatureReport(gamepad), false);
  assert.deepEqual(CONFIG_FILTERS, [{
    vendorId: 0x054c,
    productId: 0x09cc,
  }]);
});

test("connect always opens the WebHID device selector", async () => {
  const config = mockDevice([{
    usagePage: 0x01,
    usage: 0x05,
    featureReports: [{ reportId: CONFIG_REPORT_ID }],
  }]);
  const originalNavigator = globalThis.navigator;
  let requestCount = 0;
  let requestedFilters;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      hid: {
        async getDevices() { throw new Error("getDevices must not be used"); },
        async requestDevice(options) {
          requestCount += 1;
          requestedFilters = options.filters;
          return [config];
        },
      },
    },
  });
  try {
    const client = new WebHidClient();
    assert.equal(await client.connect(), config);
    assert.equal(requestCount, 1);
    assert.deepEqual(requestedFilters, CONFIG_FILTERS);
    assert.equal(config.opened, true);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("each reconnect invokes the selector again", async () => {
  const config = mockDevice([{
    usagePage: 0x01,
    usage: 0x05,
    featureReports: [{ reportId: CONFIG_REPORT_ID }],
  }]);
  const originalNavigator = globalThis.navigator;
  let requestCount = 0;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      hid: {
        async requestDevice() {
          requestCount += 1;
          return [config];
        },
      },
    },
  });
  try {
    const client = new WebHidClient();
    assert.equal(await client.connect(), config);
    await client.close();
    assert.equal(await client.connect(), config);
    assert.equal(requestCount, 2);
    assert.equal(client.transitioning, false);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("commands use Feature Report 0xF0 and poll through BUSY", async () => {
  const config = mockDevice([{
    usagePage: 0x01,
    usage: 0x05,
    featureReports: [{ reportId: CONFIG_REPORT_ID }],
  }], true);
  const sent = [];
  const busy = encodePacket(0x04, new Uint8Array(), 1);
  busy[2] = 0x01;
  const ok = encodePacket(0x04, new Uint8Array([0x55]), 1);
  let readCount = 0;
  config.sendFeatureReport = async (reportId, bytes) => {
    sent.push({ reportId, bytes: new Uint8Array(bytes) });
  };
  config.receiveFeatureReport = async (reportId) => {
    assert.equal(reportId, CONFIG_REPORT_ID);
    const bytes = readCount++ === 0 ? busy : ok;
    return new DataView(bytes.buffer);
  };

  const client = new WebHidClient();
  await client.openConfigDevice(config);
  const response = await client.sendCommand(0x04);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].reportId, CONFIG_REPORT_ID);
  assert.equal(sent[0].bytes.byteLength, CONFIG_PACKET_SIZE);
  assert.equal(decodePacket(sent[0].bytes).transactionId, 1);
  assert.equal(readCount, 2);
  assert.equal(response.status, 0);
  assert.deepEqual(Array.from(response.payload), [0x55]);
});

test("stale responses are drained before the current transaction is retried", async () => {
  const config = mockDevice([{
    usagePage: 0x01,
    usage: 0x05,
    featureReports: [{ reportId: CONFIG_REPORT_ID }],
  }], true);
  const stale = encodePacket(0x07, new Uint8Array(), 0x1234);
  const current = encodePacket(0x04, new Uint8Array([0x66]), 1);
  const sent = [];
  let readCount = 0;
  config.sendFeatureReport = async (reportId, bytes) => {
    sent.push({ reportId, packet: decodePacket(new Uint8Array(bytes)) });
  };
  config.receiveFeatureReport = async () => {
    const bytes = readCount++ === 0 ? stale : current;
    return new DataView(bytes.buffer);
  };

  const client = new WebHidClient();
  await client.openConfigDevice(config);
  const response = await client.sendCommand(0x04);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(({ packet }) => packet.transactionId), [1, 1]);
  assert.equal(response.transactionId, 1);
  assert.deepEqual(Array.from(response.payload), [0x66]);
});

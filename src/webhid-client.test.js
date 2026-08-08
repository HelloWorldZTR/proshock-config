import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG_FILTERS, CONFIG_REPORT_ID, encodePacket } from "./protocol.js";
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
  const busy = encodePacket(0x04);
  busy[2] = 0x01;
  const ok = encodePacket(0x04, new Uint8Array([0x55]));
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
  assert.equal(sent[0].bytes.byteLength, 64);
  assert.equal(readCount, 2);
  assert.equal(response.status, 0);
  assert.deepEqual(Array.from(response.payload), [0x55]);
});

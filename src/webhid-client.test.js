import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMAND,
  CONFIG_ENTRY_PAYLOAD,
  CONFIG_ENTRY_REPORT_ID,
} from "./protocol.js";
import {
  WebHidClient,
  hasConfigCollection,
  hasNormalEntryCollection,
} from "./webhid-client.js";

function mockDevice(collections, opened = false) {
  return {
    collections,
    opened,
    listeners: new Map(),
    featureReports: [],
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    removeEventListener(name) { this.listeners.delete(name); },
    async sendFeatureReport(reportId, payload) {
      this.featureReports.push({ reportId, payload: new Uint8Array(payload) });
    },
  };
}

test("normal and configuration collections remain independently detectable", () => {
  const normal = mockDevice([{ usagePage: 0xfff0, usage: 0x40 }]);
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  assert.equal(hasNormalEntryCollection(normal), true);
  assert.equal(hasConfigCollection(normal), false);
  assert.equal(hasConfigCollection(config), true);
  assert.equal(hasNormalEntryCollection(config), false);
  assert.equal(COMMAND.KEEP_ALIVE, 0x13);
  assert.equal(COMMAND.EXIT_CONFIG, 0x14);
});

test("connect enters config through Feature 0xF0 then reacquires WebHID", async () => {
  const normal = mockDevice([{ usagePage: 0xfff0, usage: 0x40 }]);
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  let getDevicesCount = 0;
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      hid: {
        async requestDevice() { return [normal]; },
        async getDevices() {
          getDevicesCount += 1;
          return getDevicesCount === 1 ? [] : [config];
        },
      },
    },
  });
  globalThis.window = { setTimeout };

  try {
    const client = new WebHidClient();
    const connected = await client.connect();
    assert.equal(connected, config);
    assert.equal(client.transitioning, false);
    assert.equal(config.opened, true);
    assert.equal(normal.featureReports.length, 1);
    assert.equal(normal.featureReports[0].reportId, CONFIG_ENTRY_REPORT_ID);
    assert.deepEqual(
      normal.featureReports[0].payload,
      CONFIG_ENTRY_PAYLOAD,
    );
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.window = originalWindow;
  }
});

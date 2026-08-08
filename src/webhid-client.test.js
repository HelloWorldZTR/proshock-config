import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMAND,
  CONFIG_ENTRY_PAYLOAD,
  CONFIG_ENTRY_REPORT_ID,
} from "./protocol.js";
import {
  WebHidClient,
  getControllerDevices,
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

test("getControllerDevices keeps only previously authorized controllers", async () => {
  const normal = mockDevice([{ usagePage: 0xfff0, usage: 0x40 }]);
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  const unrelated = mockDevice([{ usagePage: 0x01, usage: 0x06 }]);
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { hid: { async getDevices() { return [unrelated, normal, config]; } } },
  });
  try {
    assert.deepEqual(await getControllerDevices(), [normal, config]);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("connect reuses an authorized controller without another chooser", async () => {
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  const originalNavigator = globalThis.navigator;
  let requestCount = 0;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      hid: {
        async getDevices() { return [config]; },
        async requestDevice() {
          requestCount += 1;
          return [];
        },
      },
    },
  });
  try {
    const client = new WebHidClient();
    assert.equal(await client.connect(), config);
    assert.equal(requestCount, 0);
    assert.equal(config.opened, true);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
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

test("connect tolerates Windows reporting the mode-switch disconnect as a failed Feature write", async () => {
  const normal = mockDevice([{ usagePage: 0xfff0, usage: 0x40 }]);
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  const writeError = new Error("Failed to write the feature report.");
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  let getDevicesCount = 0;

  normal.sendFeatureReport = async function sendFeatureReport(reportId, payload) {
    this.featureReports.push({ reportId, payload: new Uint8Array(payload) });
    throw writeError;
  };
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
    assert.equal(await client.connect(), config);
    assert.equal(client.transitioning, false);
    assert.equal(config.opened, true);
    assert.equal(normal.featureReports.length, 1);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.window = originalWindow;
  }
});

test("connect preserves a genuine Feature write error and clears transition state", async () => {
  const normal = mockDevice([{ usagePage: 0xfff0, usage: 0x40 }]);
  const writeError = new Error("Failed to write the feature report.");
  const originalNavigator = globalThis.navigator;

  normal.sendFeatureReport = async () => { throw writeError; };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      hid: {
        async requestDevice() { return [normal]; },
        async getDevices() { return []; },
      },
    },
  });

  try {
    const client = new WebHidClient();
    client.waitForConfigDevice = async () => {
      throw new Error("Configuration mode did not appear.");
    };
    await assert.rejects(client.connect(), (error) => error === writeError);
    assert.equal(client.transitioning, false);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

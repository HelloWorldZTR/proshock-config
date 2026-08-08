import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG_FILTERS } from "./protocol.js";
import {
  WebHidClient,
  getControllerDevices,
  hasConfigCollection,
} from "./webhid-client.js";

function mockDevice(collections, opened = false) {
  return {
    collections,
    opened,
    listeners: new Map(),
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    removeEventListener(name) { this.listeners.delete(name); },
  };
}

test("only the permanent WebHID collection is treated as configurable", () => {
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  const gamepad = mockDevice([{ usagePage: 0x01, usage: 0x05 }]);
  assert.equal(hasConfigCollection(config), true);
  assert.equal(hasConfigCollection(gamepad), false);
  assert.deepEqual(CONFIG_FILTERS, [{
    vendorId: 0x054c,
    productId: 0x09cc,
    usagePage: 0xff00,
    usage: 0x01,
  }]);
});

test("getControllerDevices keeps only authorized WebHID interfaces", async () => {
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  const gamepad = mockDevice([{ usagePage: 0x01, usage: 0x05 }]);
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { hid: { async getDevices() { return [gamepad, config]; } } },
  });
  try {
    assert.deepEqual(await getControllerDevices(), [config]);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("connect opens an authorized WebHID interface without re-enumeration", async () => {
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
    assert.equal(config.listeners.has("inputreport"), true);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("connect requests only the WebHID interface when authorization is absent", async () => {
  const config = mockDevice([{ usagePage: 0xff00, usage: 0x01 }]);
  const originalNavigator = globalThis.navigator;
  let requestedFilters;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      hid: {
        async getDevices() { return []; },
        async requestDevice(options) {
          requestedFilters = options.filters;
          return [config];
        },
      },
    },
  });
  try {
    const client = new WebHidClient();
    assert.equal(await client.connect(), config);
    assert.deepEqual(requestedFilters, CONFIG_FILTERS);
    assert.equal(client.transitioning, false);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_SESSION_WARNING_STORAGE_KEY,
  createConfigSessionWarningStore,
} from "./config-session-warning-store.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("configuration warning remains visible until explicitly suppressed", () => {
  const storage = memoryStorage();
  const store = createConfigSessionWarningStore(storage);

  assert.equal(store.shouldShow(), true);
  store.acknowledge(false);
  assert.equal(store.shouldShow(), true);
  store.acknowledge(true);
  assert.equal(store.shouldShow(), false);
  assert.equal(storage.getItem(CONFIG_SESSION_WARNING_STORAGE_KEY), "1");
});

test("configuration warning restores the saved suppression preference", () => {
  const storage = memoryStorage({
    [CONFIG_SESSION_WARNING_STORAGE_KEY]: "1",
  });

  assert.equal(createConfigSessionWarningStore(storage).shouldShow(), false);
});

test("configuration warning keeps working when storage is unavailable", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const store = createConfigSessionWarningStore(storage);

  assert.equal(store.shouldShow(), true);
  assert.doesNotThrow(() => store.acknowledge(true));
  assert.equal(store.shouldShow(), false);
});

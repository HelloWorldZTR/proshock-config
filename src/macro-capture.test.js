import test from "node:test";
import assert from "node:assert/strict";
import { advanceMacroCapture, createMacroCapture, MACRO_CAPTURE_FULL } from "./macro-capture.js";

/** @brief Create a repeatable timeline independent of browser timer jitter. */
function capture(options = {}) {
  return createMacroCapture({ limit: 10, startMode: "record", mask: 2, now: 0, ...options });
}

test("long held input automatically stops at capacity without requiring an edge", () => {
  const state = capture({ limit: 2 });
  advanceMacroCapture(state, 2, 2040);
  assert.equal(state.active, false);
  assert.equal(state.notice, MACRO_CAPTURE_FULL);
  assert.deepEqual(state.steps, Array.from({ length: 2 }, () => ({ output_mask: 2, duration_4ms: 255 })));
  advanceMacroCapture(state, 0, 3000);
  assert.equal(state.steps.length, 2);
});

test("first input excludes idle time and an armed stop creates no spurious step", () => {
  const state = capture({ startMode: "first-input", mask: 0 });
  advanceMacroCapture(state, 0, 50000);
  assert.equal(state.waiting, true);
  assert.equal(state.elapsedMs, 0);
  advanceMacroCapture(state, 4, 60000);
  advanceMacroCapture(state, 4, 60100, { stop: true });
  assert.deepEqual(state.steps, [{ output_mask: 4, duration_4ms: 25 }]);
  const armed = capture({ startMode: "first-input", mask: 0 });
  advanceMacroCapture(armed, 0, 100, { stop: true });
  assert.equal(armed.active, false);
  assert.equal(armed.waiting, false);
  assert.equal(armed.steps.length, 0);
});

test("input edges retain release steps and report a full pool", () => {
  const state = capture({ limit: 2 });
  advanceMacroCapture(state, 0, 100);
  advanceMacroCapture(state, 4, 200);
  assert.deepEqual(state.steps, [{ output_mask: 2, duration_4ms: 25 }, { output_mask: 0, duration_4ms: 25 }]);
  assert.equal(state.active, false);
  assert.equal(state.notice, MACRO_CAPTURE_FULL);
});

test("stop bounds oversized segments and allows a legitimate all-pause sequence", () => {
  const state = capture({ limit: 1, mask: 0 });
  advanceMacroCapture(state, 0, 10000, { stop: true });
  assert.deepEqual(state.steps, [{ output_mask: 0, duration_4ms: 255 }]);
  assert.equal(state.notice, MACRO_CAPTURE_FULL);
  const empty = capture({ limit: 0 });
  assert.equal(empty.active, false);
  assert.equal(empty.notice, MACRO_CAPTURE_FULL);
});

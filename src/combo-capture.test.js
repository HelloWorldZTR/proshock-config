import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceComboCapture,
  createComboCaptureTracker,
} from "./combo-capture.js";

test("Combo capture waits for neutral and requires 100 ms stability", () => {
  const tracker = createComboCaptureTracker();
  const chord = (1 << 0) | (1 << 18);

  assert.equal(advanceComboCapture(tracker, 1 << 0, 0).phase, "waiting-neutral");
  assert.equal(advanceComboCapture(tracker, 0, 20).phase, "capturing");
  assert.equal(advanceComboCapture(tracker, 1 << 0, 40).complete, false);
  assert.equal(advanceComboCapture(tracker, chord, 60).complete, false);
  assert.equal(advanceComboCapture(tracker, chord, 140).complete, false);
  const result = advanceComboCapture(tracker, chord, 160);
  assert.equal(result.complete, true);
  assert.equal(result.mask, chord);
  assert.equal(result.leader, 0);
});

test("Combo capture preserves a simultaneous existing Leader and resets attempts", () => {
  const tracker = createComboCaptureTracker(18);
  const chord = (1 << 0) | (1 << 18);

  advanceComboCapture(tracker, 0, 0);
  advanceComboCapture(tracker, 1 << 3, 20);
  advanceComboCapture(tracker, 0, 40);
  advanceComboCapture(tracker, chord, 60);
  const result = advanceComboCapture(tracker, chord, 160);
  assert.equal(result.complete, true);
  assert.equal(result.leader, 18);
});

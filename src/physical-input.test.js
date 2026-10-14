import test from "node:test";
import assert from "node:assert/strict";
import { physicalPressedSources } from "./physical-input.js";

test("K1 through K8 follow physical inputs independently of mapped outputs", () => {
  for (let source = 18; source <= 25; source++) {
    assert.deepEqual([...physicalPressedSources({ buttons: 1, digital_mask: 1 << source })], [source]);
  }
  assert.deepEqual([...physicalPressedSources({ digital_mask: (1 << 18) | (1 << 25) })], [18, 25]);
});
test("a released physical snapshot clears feedback even if the mapped output remains held", () => {
  assert.equal(physicalPressedSources({ digital_mask: 0, buttons: 1 }).size, 0);
});
test("legacy and disconnected inputs never invent K-button activity", () => {
  assert.deepEqual([...physicalPressedSources({ buttons: 1, dpad_hat: 1 })], [0, 14, 15]);
  assert.equal(physicalPressedSources(null).size, 0);
});

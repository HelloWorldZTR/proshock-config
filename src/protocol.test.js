import assert from "node:assert/strict";
import test from "node:test";
import {
  digitalMaskFromRawInput,
  parseDigitalInput,
} from "./protocol.js";

test("digital input parser preserves the full connected 26-bit mask", () => {
  const payload = new Uint8Array(8);
  const view = new DataView(payload.buffer);
  view.setUint32(0, 42, true);
  view.setUint32(4, (1 << 0) | (1 << 18) | (1 << 25) | (1 << 30), true);
  assert.deepEqual(parseDigitalInput(payload), {
    sequence: 42,
    digital_mask: (1 << 0) | (1 << 18) | (1 << 25),
  });
});

test("legacy raw input fallback reconstructs buttons and diagonal D-pad", () => {
  assert.equal(digitalMaskFromRawInput({
    buttons: (1 << 0) | (1 << 12),
    dpad_hat: 1,
  }), (1 << 0) | (1 << 12) | (1 << 14) | (1 << 15));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIG_INFO_SIZE,
  LEGACY_CONFIG_INFO_SIZE,
  digitalMaskFromRawInput,
  parseConfigInfo,
  parseDs4InputReport,
  parseDigitalInput,
} from "./protocol.js";

function configInfoPayload(size) {
  const payload = new Uint8Array(size);
  const view = new DataView(payload.buffer);
  view.setUint16(0, 7, true);
  view.setUint16(2, 320, true);
  payload[4] = 4;
  return payload;
}

test("config info reads firmware axis flip mask", () => {
  const payload = configInfoPayload(CONFIG_INFO_SIZE);
  payload[52] = 0x0a;
  const info = parseConfigInfo(payload);

  assert.equal(info.axis_invert_mask, 0x0a);
  assert.deepEqual(info.axis_invert, [false, true, false, true]);
});

test("config info keeps prototype polarity for legacy firmware", () => {
  const info = parseConfigInfo(configInfoPayload(LEGACY_CONFIG_INFO_SIZE));

  assert.equal(info.axis_invert_mask, null);
  assert.deepEqual(info.axis_invert, [false, false, false, false]);
});

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

test("DS4 interrupt input drives live preview without Feature polling", () => {
  const payload = new Uint8Array(63);
  payload.set([0, 128, 255, 64], 0);
  payload[4] = 0x31;
  payload[5] = 0x02;
  payload[6] = 0x35;
  payload[7] = 0;
  payload[8] = 255;

  assert.deepEqual(parseDs4InputReport(new DataView(payload.buffer)), {
    counter: 13,
    buttons: 0x1023,
    dpad_hat: 1,
    hid: [0, 128, 255, 64, 0, 255],
    output_stick_q15: [-32767, 0, 32767, -16384],
    output_trigger_q15: [0, 32767],
  });
});

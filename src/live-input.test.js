import test from "node:test";
import assert from "node:assert/strict";
import { createLiveInputSnapshot } from "./live-input.js";

test("live processed pipeline keeps the firmware analog snapshot as its truth", () => {
  const raw = {
    sequence: 77,
    adc: [2047, 2049, 2051, 2045, 6, 8],
    adc_running: 1,
  };
  const firmwareSnapshot = {
    sequence: 81,
    raw_adc: [100, 3900, 200, 3800, 2000, 3000],
    calibrated_stick_q15: [-120, 240, -360, 480],
    calibrated_trigger_q15: [100, 32000],
    output_stick_q15: [-64, 128, -256, 512],
    output_trigger_q15: [0, 32767],
    hid: [128, 129, 127, 130, 0, 255],
    adc_running: 1,
    validation_flags: 1,
    runtime_generation: 9,
  };
  const live = createLiveInputSnapshot(firmwareSnapshot);

  assert.equal(live.sequence, 81);
  assert.deepEqual(live.raw_adc, firmwareSnapshot.raw_adc);
  assert.notDeepEqual(live.raw_adc, raw.adc);
  assert.deepEqual(live.calibrated_stick_q15, firmwareSnapshot.calibrated_stick_q15);
  assert.deepEqual(live.output_stick_q15, firmwareSnapshot.output_stick_q15);
  assert.deepEqual(live.hid, firmwareSnapshot.hid);
  assert.equal(live.runtime_generation, 9);
  assert.equal(live.source, "firmware-analog-snapshot");
});

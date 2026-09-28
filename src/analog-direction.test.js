import test from "node:test";
import assert from "node:assert/strict";
import { analogAxisInvert, changeAnalogDirection } from "./analog-direction.js";
import { createDefaultAnalogCalibration, writeAnalogCalibrationToPayload, parseAnalogCalibration, parseConfigInfo } from "./protocol.js";
import { analyzeTriggers, buildCalibrationDraft, createTriggerCycleCapture, recordTriggerCycleSample, normalizeAxis, normalizedTrigger, validateCalibration } from "./calibration.js";

/** @brief Prepare a non-symmetric physical boundary so incorrect reflections are visible. */
function calibrationFixture() {
  const calibration = createDefaultAnalogCalibration();
  calibration.stick.forEach((stick, index) => { stick.radius_q15 = Array.from({ length: 16 }, (_, sector) => 30000 + index * 1000 + sector * 100); });
  calibration.raw.fill(0x5a);
  return calibration;
}

test("all 64 directions retain raw bounds, reflect sectors once, and survive serialization", () => {
  for (let mask = 0; mask < 64; mask++) {
    const original = calibrationFixture();
    let draft = original;
    for (let channel = 0; channel < 6; channel++) draft = changeAnalogDirection(draft, channel, !!(mask & (1 << channel)));
    assert.equal(draft.direction_mask, mask);
    assert.deepEqual(draft.axis, original.axis);
    assert.equal(validateCalibration(draft).pass, true);
    const axes = analogAxisInvert(draft);
    draft.axis.forEach((axis, channel) => {
      assert.equal(normalizeAxis(axes[channel] ? axis.raw_min : axis.raw_max, axis, channel, axes), 1);
      assert.equal(Math.abs(normalizeAxis(axis.raw_center, axis, channel, axes)), 0);
    });
    for (let stick = 0; stick < 2; stick++) {
      for (let source = 0; source < 16; source++) {
        let destination = source;
        if (mask & (1 << (stick * 2))) destination = (8 - destination + 16) % 16;
        if (mask & (1 << (stick * 2 + 1))) destination = (16 - destination) % 16;
        assert.equal(draft.stick[stick].radius_q15[destination], original.stick[stick].radius_q15[source]);
      }
    }
    draft.trigger.forEach(trigger => {
      assert.equal(normalizedTrigger(trigger.raw_released, trigger), 0);
      assert.equal(normalizedTrigger(trigger.raw_pressed, trigger), 1);
    });
    const bytes = new Uint8Array(draft.raw);
    writeAnalogCalibrationToPayload(bytes, draft);
    assert.deepEqual([...bytes.slice(109)], Array(7).fill(0x5a));
    const parsed = parseAnalogCalibration(bytes);
    assert.equal(parsed.direction_mask, mask);
    assert.deepEqual(parsed.stick, draft.stick);
    assert.deepEqual(parsed.trigger, draft.trigger);
    for (let channel = 0; channel < 6; channel++) {
      assert.deepEqual(changeAnalogDirection(parsed, channel, !!(mask & (1 << channel))), parsed);
      draft = changeAnalogDirection(draft, channel, false);
    }
    assert.deepEqual(draft, original);
  }
});

test("reversed and mixed trigger calibration captures actual ADC endpoints and inward margins", () => {
  for (const mask of [0, 16, 32, 48]) {
    let sequence = 0;
    const signs = [0, 1].map(index => mask & (1 << (4 + index)) ? -1 : 1);
    const baselines = signs.map(sign => sign < 0 ? 4000 : 100);
    const snapshot = (travel) => ({ sequence: ++sequence, adc: [2048, 2048, 2048, 2048, ...baselines.map((value, index) => value + signs[index] * travel)] });
    const released = Array.from({ length: 64 }, () => snapshot(0));
    const capture = createTriggerCycleCapture(released, mask);
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const travel of [30, 1000, 2000, 3000, ...Array(14).fill(3900), 3000, 1000]) recordTriggerCycleSample(capture, snapshot(travel));
      assert.equal(recordTriggerCycleSample(capture, snapshot(0)), true);
    }
    assert.equal(capture.pressWindows.length, 5);
    const triggers = analyzeTriggers(released, capture.pressWindows, mask);
    triggers.forEach((trigger, index) => {
      assert.equal(trigger.raw_released, baselines[index] + signs[index] * 78);
      assert.equal(trigger.raw_pressed, baselines[index] + signs[index] * (3900 - 78));
      assert.equal(normalizedTrigger(baselines[index], trigger), 0);
      assert.equal(normalizedTrigger(baselines[index] + signs[index] * 3900, trigger), 1);
    });
    const base = calibrationFixture(); base.direction_mask = mask;
    const range = index => ({ axis: base.axis.slice(index * 2, index * 2 + 2), radius_q15: base.stick[index].radius_q15 });
    const built = buildCalibrationDraft(base, { axes: base.axis.map(axis => ({ center: axis.raw_center })) }, range(0), range(1), triggers);
    assert.equal(built.direction_mask, mask);
    assert.equal(validateCalibration(built).pass, true);
    assert.deepEqual(built.axis, base.axis);
    assert.deepEqual(built.stick, base.stick);
  }
});

test("legacy calibration stays V1 and reserved byte 108 never becomes a direction", () => {
  const legacy = calibrationFixture(); legacy.calibration_version = 1;
  const bytes = new Uint8Array(legacy.raw);
  writeAnalogCalibrationToPayload(bytes, legacy);
  assert.equal(bytes[0], 1); assert.equal(bytes[108], 0x5a);
  const parsed = parseAnalogCalibration(bytes);
  assert.equal(parsed.direction_mask, 0);
  assert.deepEqual(analogAxisInvert(parsed, [false, true, false, true]), [false, true, false, true]);
  assert.throws(() => changeAnalogDirection(parsed, 0, true), /V2/);
});

test("config info advertises all six directions only with calibration V2", () => {
  const payload = new Uint8Array(56); payload[52] = 10; payload[53] = 63; payload[54] = 2;
  assert.equal(parseConfigInfo(payload).analog_direction_mask, 63);
  assert.equal(parseConfigInfo(payload).analog_calibration_version, 2);
  payload[54] = 0;
  assert.equal(parseConfigInfo(payload).analog_direction_mask, null);
});

test("validation rejects inconsistent trigger direction and unknown mask bits", () => {
  const calibration = calibrationFixture(); calibration.direction_mask = 64;
  assert.equal(validateCalibration(calibration).pass, false);
  calibration.direction_mask = 16;
  assert.equal(validateCalibration(calibration).pass, false);
  assert.throws(() => changeAnalogDirection(calibration, 6, true));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALOG_CALIBRATION_SIZE,
  ANALOG_SNAPSHOT_SIZE,
  PROFILE_SIZE,
  PROFILE_VERSION,
  createDefaultAnalogCalibration,
  createLinearResponse,
  parseAnalogCalibration,
  parseAnalogSnapshot,
  parseProfile,
  writeAnalogCalibrationToPayload,
  writeProfileDraftToPayload,
} from "./protocol.js";
import {
  analyzeCenterReturns,
  analyzeNeutral,
  analyzeStickRange,
  analyzeTriggers,
  curvePresetToQ15,
  createCenterReturnCapture,
  createTriggerCycleCapture,
  nextWizardStep,
  recordCenterReturnSample,
  recordTriggerCycleSample,
  validateCalibration,
  validateResponse,
} from "./calibration.js";
import { cloneConfigData } from "./clone-data.js";

function snapshot(sequence, adc) {
  return { sequence, adc };
}

test("config cloning unwraps proxies and preserves binary payloads", () => {
  const raw = new Uint8Array([1, 2, 3]);
  const source = new Proxy({
    nested: new Proxy({ value: 42 }, {}),
    list: new Proxy([1, 2], {}),
    raw,
  }, {});

  assert.throws(() => structuredClone(source), /could not be cloned|not be cloned/i);

  const cloned = cloneConfigData(source);
  assert.deepEqual(cloned.nested, { value: 42 });
  assert.deepEqual(cloned.list, [1, 2]);
  assert.ok(cloned.raw instanceof Uint8Array);
  assert.deepEqual(cloned.raw, raw);

  cloned.nested.value = 7;
  cloned.raw[0] = 9;
  assert.equal(source.nested.value, 42);
  assert.equal(raw[0], 1);
});

test("neutral uses 64 unique snapshots and rejects duplicates", () => {
  const samples = Array.from({ length: 64 }, (_, index) => (
    snapshot(index, [2048 + index % 3, 2048, 2047, 2049, 200, 200])
  ));
  samples.push(snapshot(63, [0, 0, 0, 0, 0, 0]));
  const result = analyzeNeutral(samples);
  assert.equal(result.sampleCount, 64);
  assert.equal(result.axes[0].center, 2049);
  assert.ok(result.axes.every((axis) => axis.pass));
});

test("center capture requires four diagonal deflections and return windows", () => {
  let sequence = 0;
  const center = [2048, 2048, 2052, 2044, 200, 200];
  const baseline = Array.from({ length: 16 }, () => (
    snapshot(sequence++, [...center])
  ));
  const capture = createCenterReturnCapture(baseline);
  const directions = [
    [500, 3600, 500, 3600, 200, 200],
    [3600, 500, 3600, 500, 200, 200],
    [3600, 3600, 3600, 3600, 200, 200],
    [500, 500, 500, 500, 200, 200],
  ];
  assert.equal(recordCenterReturnSample(
    capture,
    snapshot(sequence++, [500, 2048, 500, 2044, 200, 200]),
  ), false);
  assert.equal(capture.phase, "waiting-deflection");
  directions.forEach((deflected, directionIndex) => {
    assert.equal(recordCenterReturnSample(
      capture,
      snapshot(sequence++, deflected),
    ), false);
    for (let stableIndex = 0; stableIndex < 5; stableIndex += 1) {
      assert.equal(recordCenterReturnSample(
        capture,
        snapshot(sequence++, [...center]),
      ), false);
    }
    for (let sampleIndex = 0; sampleIndex < 16; sampleIndex += 1) {
      const returned = center.map((value, axisIndex) => (
        axisIndex < 4 ? value + (directionIndex + sampleIndex) % 3 - 1 : value
      ));
      const complete = recordCenterReturnSample(
        capture,
        snapshot(sequence++, returned),
      );
      assert.equal(complete, directionIndex === 3 && sampleIndex === 15);
    }
  });
  const result = analyzeCenterReturns(capture.returnWindows);
  assert.equal(result.returns.length, 4);
  assert.equal(result.sampleCount, 64);
  assert.deepEqual(result.axes.map((axis) => axis.center), center.slice(0, 4));
  assert.ok(result.axes.every((axis) => axis.pass));
});

test("stick range produces complete 16-sector roundness", () => {
  const neutral = {
    axes: Array.from({ length: 4 }, (_, index) => ({
      name: ["LX", "LY", "RX", "RY"][index],
      center: 2048,
      pass: true,
    })),
  };
  const samples = [];
  let sequence = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector * Math.PI * 2 / 16;
    for (let repeat = 0; repeat < 10; repeat += 1) {
      samples.push(snapshot(sequence, [
        Math.round(2048 + Math.cos(angle) * 1800),
        Math.round(2048 - Math.sin(angle) * 1800),
        2048,
        2048,
        200,
        200,
      ]));
      sequence += 1;
    }
  }
  const result = analyzeStickRange(samples, 0, neutral);
  assert.ok(result.sectorCounts.every((count) => count >= 8));
  assert.ok(result.radius_q15.every((radius) => radius >= 27852 && radius <= 49151));
});

test("stick range rejects a small circle normalized against its own envelope", () => {
  const neutral = {
    axes: Array.from({ length: 4 }, (_, index) => ({
      name: ["LX", "LY", "RX", "RY"][index],
      center: 2048,
      noiseSpan: 2,
      pass: true,
    })),
  };
  const samples = [];
  let sequence = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector * Math.PI * 2 / 16;
    for (let repeat = 0; repeat < 10; repeat += 1) {
      samples.push(snapshot(sequence, [
        Math.round(2048 + Math.cos(angle) * 256),
        Math.round(2048 - Math.sin(angle) * 256),
        2048,
        2048,
        200,
        200,
      ]));
      sequence += 1;
    }
  }

  assert.throws(
    () => analyzeStickRange(samples, 0, neutral),
    /below 512 ADC counts/,
  );
});

test("stick range rejects excessive normalized neutral noise", () => {
  const neutral = {
    axes: Array.from({ length: 4 }, (_, index) => ({
      name: ["LX", "LY", "RX", "RY"][index],
      center: 2048,
      noiseSpan: index < 2 ? 32 : 2,
      pass: true,
    })),
  };
  const samples = [];
  let sequence = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector * Math.PI * 2 / 16;
    for (let repeat = 0; repeat < 10; repeat += 1) {
      samples.push(snapshot(sequence, [
        Math.round(2048 + Math.cos(angle) * 800),
        Math.round(2048 - Math.sin(angle) * 800),
        2048,
        2048,
        200,
        200,
      ]));
      sequence += 1;
    }
  }

  assert.throws(
    () => analyzeStickRange(samples, 0, neutral),
    /neutral noise is 4\.00%/,
  );
});

test("stick boundary uses the outer envelope instead of accumulated pass count", () => {
  const neutral = {
    axes: Array.from({ length: 4 }, (_, index) => ({
      name: ["LX", "LY", "RX", "RY"][index],
      center: 2048,
      pass: true,
    })),
  };
  const samples = [];
  let sequence = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector * Math.PI * 2 / 16;
    for (let repeat = 0; repeat < 10; repeat += 1) {
      samples.push(snapshot(sequence, [
        Math.round(2048 + Math.cos(angle) * 1800),
        Math.round(2048 - Math.sin(angle) * 1800),
        2048,
        2048,
        200,
        200,
      ]));
      sequence += 1;
    }
  }
  const baseline = analyzeStickRange(samples, 0, neutral);
  for (let repeat = 0; repeat < 700; repeat += 1) {
    samples.push(snapshot(sequence, [
      Math.round(2048 + 0.86 * 1800),
      2048,
      2048,
      2048,
      200,
      200,
    ]));
    sequence += 1;
  }
  const repeated = analyzeStickRange(samples, 0, neutral);
  assert.equal(repeated.radius_q15[0], baseline.radius_q15[0]);
});

test("trigger analysis enforces released-low fixed polarity", () => {
  const released = Array.from({ length: 64 }, (_, index) => (
    snapshot(index, [2048, 2048, 2048, 2048, 200 + index % 2, 240 + index % 2])
  ));
  const windows = Array.from({ length: 5 }, (_, press) => (
    Array.from({ length: 12 }, (_, index) => (
      snapshot(100 + press * 20 + index, [2048, 2048, 2048, 2048, 260 + press, 300 + press])
    ))
  ));
  const triggers = analyzeTriggers(released, windows);
  assert.equal(triggers[0].raw_released, 202);
  assert.equal(triggers[0].raw_pressed, 261);
  assert.ok(triggers.every((trigger) => trigger.raw_released < trigger.raw_pressed));
});

test("trigger calibration applies symmetric two-percent endpoint margins", () => {
  const released = Array.from({ length: 64 }, (_, index) => (
    snapshot(index, [2048, 2048, 2048, 2048, 100, 100])
  ));
  const wideWindows = Array.from({ length: 5 }, (_, windowIndex) => (
    Array.from({ length: 12 }, (_, sampleIndex) => (
      snapshot(
        100 + windowIndex * 20 + sampleIndex,
        [2048, 2048, 2048, 2048, 1100, 1100],
      )
    ))
  ));
  const wide = analyzeTriggers(released, wideWindows);
  assert.equal(wide[0].raw_released, 120);
  assert.equal(wide[0].raw_pressed, 1080);

  const nearFullWindows = Array.from({ length: 5 }, (_, windowIndex) => (
    Array.from({ length: 12 }, (_, sampleIndex) => (
      snapshot(
        200 + windowIndex * 20 + sampleIndex,
        [2048, 2048, 2048, 2048, 3100, 3100],
      )
    ))
  ));
  const nearFull = analyzeTriggers(released, nearFullWindows);
  assert.equal(nearFull[0].raw_released, 160);
  assert.equal(nearFull[0].raw_pressed, 3040);

  const tinyWindows = Array.from({ length: 5 }, (_, windowIndex) => (
    [snapshot(300 + windowIndex, [2048, 2048, 2048, 2048, 101, 101])]
  ));
  const tiny = analyzeTriggers(released, tinyWindows);
  assert.equal(tiny[0].raw_released, 100);
  assert.equal(tiny[0].raw_pressed, 101);
});

test("trigger validation accepts any positive ADC span", () => {
  const calibration = createDefaultAnalogCalibration();
  calibration.trigger[0].raw_released = 1000;
  calibration.trigger[0].raw_pressed = 1001;
  assert.equal(validateCalibration(calibration).pass, true);

  calibration.trigger[0].raw_pressed = 1000;
  assert.equal(validateCalibration(calibration).pass, false);
});

test("calibration rejects a roundness boundary that would cause early saturation", () => {
  const calibration = createDefaultAnalogCalibration();
  calibration.stick[0].radius_q15[0] = 27852;
  assert.equal(validateCalibration(calibration).pass, false);

  calibration.stick[0].radius_q15[0] = 27853;
  assert.equal(validateCalibration(calibration).pass, true);
});

test("trigger cycle capture detects five press and release actions", () => {
  const released = Array.from({ length: 64 }, (_, index) => (
    snapshot(index, [2048, 2048, 2048, 2048, 200, 240])
  ));
  const capture = createTriggerCycleCapture(released);
  let sequence = 100;

  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (const delta of [3, 20, 45, 60, 45, 20, 0]) {
      recordTriggerCycleSample(
        capture,
        snapshot(sequence, [2048, 2048, 2048, 2048, 200 + delta, 240 + delta]),
      );
      sequence += 1;
    }
  }

  assert.equal(capture.pressWindows.length, 5);
  const triggers = analyzeTriggers(released, capture.pressWindows);
  assert.equal(triggers[0].raw_released, 201);
  assert.equal(triggers[0].raw_pressed, 244);
  assert.ok(triggers[0].raw_pressed - triggers[0].raw_released < 128);
});

test("profile and analog payload round trips preserve fixed sizes", () => {
  const profileBytes = new Uint8Array(PROFILE_SIZE);
  profileBytes.fill(0xa5);
  const profile = {
    profile_version: PROFILE_VERSION,
    flags: 3,
    color_rgb: [1, 2, 3],
    stick_response: [createLinearResponse(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
  };
  writeProfileDraftToPayload(profileBytes, profile);
  const parsedProfile = parseProfile(profileBytes, 2);
  assert.equal(parsedProfile.profile_version, PROFILE_VERSION);
  assert.deepEqual(parsedProfile.color_rgb, [1, 2, 3]);
  assert.equal(parsedProfile.raw[250], 0);

  const calibrationBytes = new Uint8Array(ANALOG_CALIBRATION_SIZE);
  calibrationBytes.fill(0x5a);
  const calibration = createDefaultAnalogCalibration();
  writeAnalogCalibrationToPayload(calibrationBytes, calibration);
  const parsedCalibration = parseAnalogCalibration(calibrationBytes);
  assert.equal(parsedCalibration.axis[0].raw_center, 2048);
  assert.equal(parsedCalibration.raw[112], 0x5a);
  assert.equal(validateCalibration(parsedCalibration).pass, true);
});

test("analog snapshot parser matches the packed firmware layout", () => {
  const bytes = new Uint8Array(ANALOG_SNAPSHOT_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x12345678, true);
  [2040, 2050, 2030, 2060, 12, 4080].forEach((value, index) => {
    view.setUint16(4 + index * 2, value, true);
  });
  [-120, 240, -360, 480].forEach((value, index) => {
    view.setInt16(16 + index * 2, value, true);
  });
  [100, 32000].forEach((value, index) => view.setUint16(24 + index * 2, value, true));
  [-64, 128, -256, 512].forEach((value, index) => {
    view.setInt16(28 + index * 2, value, true);
  });
  [0, 32767].forEach((value, index) => view.setUint16(36 + index * 2, value, true));
  bytes.set([128, 129, 127, 130, 0, 255], 40);
  bytes[46] = 1;
  bytes[47] = 3;
  view.setUint32(48, 42, true);

  const parsed = parseAnalogSnapshot(bytes);
  assert.equal(parsed.sequence, 0x12345678);
  assert.deepEqual(parsed.raw_adc, [2040, 2050, 2030, 2060, 12, 4080]);
  assert.deepEqual(parsed.output_stick_q15, [-64, 128, -256, 512]);
  assert.deepEqual(parsed.hid, [128, 129, 127, 130, 0, 255]);
  assert.equal(parsed.runtime_generation, 42);
});

test("curve presets are monotonic and wizard transitions are deterministic", () => {
  for (const name of ["linear", "centerPrecise", "centerAggressive", "earlyFull"]) {
    const response = createLinearResponse();
    response.curve = curvePresetToQ15(name);
    assert.equal(validateResponse(response), true);
  }
  assert.equal(nextWizardStep("neutral"), "sticks-range");
  assert.equal(nextWizardStep("triggers-released", -1), "sticks-range");
  assert.equal(nextWizardStep("triggers-pressed"), "validate-calibration");
  assert.equal(nextWizardStep("validate-calibration"), "save");
});

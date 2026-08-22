import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALOG_CALIBRATION_SIZE,
  ANALOG_SNAPSHOT_SIZE,
  PROFILE_SIZE,
  PROFILE_VERSION,
  createDefaultAnalogCalibration,
  createDefaultStickRc,
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
  normalizeAxis,
  recordCenterReturnSample,
  recordTriggerCycleSample,
  validateCalibration,
  validateResponse,
} from "./calibration.js";
import { cloneConfigData } from "./clone-data.js";
import { LEGACY_CALIBRATION_AXIS_INVERT } from "./calibration-polarity.js";

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

test("center capture advances only when the user confirms each return", () => {
  let sequence = 0;
  const center = [2048, 2048, 2052, 2044, 200, 200];
  const capture = createCenterReturnCapture();
  const directions = [
    [500, 500, 500, 500, 200, 200],
    [3600, 3600, 3600, 3600, 200, 200],
    [3600, 500, 3600, 500, 200, 200],
    [500, 3600, 500, 3600, 200, 200],
  ];
  directions.forEach((deflected, directionIndex) => {
    assert.equal(recordCenterReturnSample(
      capture,
      snapshot(sequence++, deflected),
    ), false);
    for (let sampleIndex = 0; sampleIndex < 16; sampleIndex += 1) {
      const returned = center.map((value, axisIndex) => (
        axisIndex < 4 ? value + (directionIndex + sampleIndex) % 3 - 1 : value
      ));
      const complete = recordCenterReturnSample(
        capture,
        snapshot(sequence++, returned),
      );
      assert.equal(complete, false);
    }
    assert.equal(capture.directionIndex, directionIndex);
    const complete = recordCenterReturnSample(
      capture,
      snapshot(sequence++, [...center]),
      true,
    );
    assert.equal(complete, directionIndex === 3);
    assert.equal(capture.directionIndex, directionIndex + 1);
  });
  const result = analyzeCenterReturns(capture.returnWindows);
  assert.equal(result.returns.length, 4);
  assert.equal(result.sampleCount, 64);
  assert.deepEqual(result.axes.map((axis) => axis.center), center.slice(0, 4));
  assert.ok(result.axes.every((axis) => axis.pass));
});

test("stable direction-dependent centers warn without blocking calibration", () => {
  let sequence = 0;
  const centers = [2000, 2040, 2080, 2120];
  const windows = centers.map((center) => (
    Array.from({ length: 16 }, () => snapshot(
      sequence++,
      [center, center, center, center, 200, 200],
    ))
  ));

  const result = analyzeCenterReturns(windows);
  assert.ok(result.axes.every((axis) => axis.pass));
  assert.ok(result.axes.every((axis) => axis.warning));
  assert.ok(result.axes.every((axis) => axis.returnCenterSpan === 120));
  assert.deepEqual(result.axes.map((axis) => axis.center), [2060, 2060, 2060, 2060]);
});

test("manual center confirmation requires a complete pre-press sample window", () => {
  let sequence = 0;
  const center = [2048, 2048, 2048, 2048, 200, 200];
  const capture = createCenterReturnCapture();
  for (let index = 0; index < 8; index += 1) {
    recordCenterReturnSample(
      capture,
      snapshot(sequence++, [...center]),
    );
  }
  assert.equal(recordCenterReturnSample(
    capture,
    snapshot(sequence++, [...center]),
    true,
  ), false);
  assert.equal(capture.directionIndex, 0);
  assert.equal(capture.insufficientSamples, true);

  for (let index = 0; index < 16; index += 1) {
    recordCenterReturnSample(
      capture,
      snapshot(sequence++, [...center]),
    );
  }
  assert.equal(capture.directionIndex, 0);
  assert.equal(recordCenterReturnSample(
    capture,
    snapshot(sequence++, [...center]),
    true,
  ), false);
  assert.equal(capture.directionIndex, 1);
  assert.equal(capture.insufficientSamples, false);
});

test("calibration polarity supports legacy and firmware-provided flips", () => {
  const calibration = {
    raw_min: 0,
    raw_center: 2048,
    raw_max: 4095,
  };

  assert.deepEqual(
    [...LEGACY_CALIBRATION_AXIS_INVERT],
    [false, false, false, false],
  );
  assert.ok(normalizeAxis(1024, calibration, 1) < 0);
  assert.ok(normalizeAxis(3072, calibration, 1) > 0);
  assert.ok(normalizeAxis(1024, calibration, 3) < 0);
  assert.ok(normalizeAxis(3072, calibration, 3) > 0);
  assert.ok(normalizeAxis(1024, calibration, 1, [false, true, false, true]) > 0);
  assert.ok(normalizeAxis(3072, calibration, 1, [false, true, false, true]) < 0);
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
        Math.round(2048 + Math.sin(angle) * 1800),
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

test("legacy polarity keeps roundness sectors aligned with firmware coordinates", () => {
  const neutral = {
    axes: Array.from({ length: 4 }, (_, index) => ({
      name: ["LX", "LY", "RX", "RY"][index],
      center: 2048,
      noiseSpan: 0,
      pass: true,
    })),
  };
  const samples = [];
  let sequence = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector * Math.PI * 2 / 16;
    const radius = sector === 2 ? 0.9 : 1;
    for (let repeat = 0; repeat < 10; repeat += 1) {
      samples.push(snapshot(sequence, [
        Math.round(2048 + Math.cos(angle) * 1600 * radius),
        Math.round(2048 + Math.sin(angle) * 1600 * radius),
        2048,
        2048,
        200,
        200,
      ]));
      sequence += 1;
    }
  }

  const result = analyzeStickRange(samples, 0, neutral);
  assert.ok(result.radius_q15[2] < result.radius_q15[14]);
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
        Math.round(2048 + Math.sin(angle) * 256),
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
        Math.round(2048 + Math.sin(angle) * 800),
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
        Math.round(2048 + Math.sin(angle) * 1800),
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
    pollrate_hz: 2000,
    stick_response: [createLinearResponse(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
    stick_shape: [
      { name: "Left stick", scale_q15: Array(16).fill(32768) },
      { name: "Right stick", scale_q15: Array(16).fill(32768) },
    ],
    stick_rc: [createDefaultStickRc(), createDefaultStickRc()],
  };
  profile.stick_shape[0].scale_q15[12] = 12345;
  writeProfileDraftToPayload(profileBytes, profile);
  const parsedProfile = parseProfile(profileBytes, 2);
  assert.equal(parsedProfile.profile_version, PROFILE_VERSION);
  assert.deepEqual(parsedProfile.color_rgb, [1, 2, 3]);
  assert.equal(parsedProfile.pollrate_hz, 2000);
  assert.equal(parsedProfile.raw[250], 0);
  assert.equal(parsedProfile.stick_shape[0].scale_q15[12], 12345);
  assert.equal(parsedProfile.stick_shape[1].scale_q15[15], 32768);
  assert.equal(parsedProfile.stick_rc[0].smoothing_alpha_q15, 5825);
  assert.equal(parsedProfile.stick_rc[1].boost_gain_q8_8, 64);

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

import test from "node:test";
import assert from "node:assert/strict";
import { calibrationAxisSign } from "./calibration-polarity.js";
import { ROUNDNESS_Q15_ONE } from "./protocol.js";
import {
  ROUNDNESS_RADIUS_MAX_Q15,
  ROUNDNESS_RADIUS_MIN_Q15,
  roundnessBoundaryPoints,
  roundnessEditorStickPosition,
  roundnessPercentToQ15,
  roundnessQ15ToPercent,
  roundnessSectorFromPosition,
} from "./roundness-editor.js";

test("roundness detail converts the full validated Q1.15 range", () => {
  assert.equal(roundnessPercentToQ15(85), ROUNDNESS_RADIUS_MIN_Q15);
  assert.equal(roundnessPercentToQ15(100), ROUNDNESS_Q15_ONE);
  assert.equal(roundnessPercentToQ15(150), ROUNDNESS_RADIUS_MAX_Q15);
  assert.equal(roundnessQ15ToPercent(ROUNDNESS_Q15_ONE), 100);
  assert.ok(roundnessQ15ToPercent(ROUNDNESS_RADIUS_MAX_Q15) < 150);
});

test("pie sectors follow firmware output coordinates", () => {
  assert.equal(roundnessSectorFromPosition(1, 0), 0);
  assert.equal(roundnessSectorFromPosition(0, 1), 4);
  assert.equal(roundnessSectorFromPosition(-1, 0), 8);
  assert.equal(roundnessSectorFromPosition(0, -1), 12);
  assert.equal(
    roundnessBoundaryPoints(Array(16).fill(ROUNDNESS_Q15_ONE)).split(" ").length,
    16,
  );
});

test("live pie position uses the same temporary axis flip as calibration", () => {
  const axis = ["LX", "LY", "RX", "RY"].map((name) => ({
    name,
    raw_min: 0,
    raw_center: 2048,
    raw_max: 4095,
  }));
  const raw = { adc: [4095, 0, 4095, 0] };
  const calibration = { axis };

  [0, 1].forEach((stickIndex) => {
    const position = roundnessEditorStickPosition(raw, calibration, stickIndex);
    const yAxisIndex = stickIndex * 2 + 1;
    const expectedY = -calibrationAxisSign(yAxisIndex);
    assert.ok(position.x > 0.99);
    assert.equal(Math.sign(position.y), Math.sign(expectedY));
    assert.equal(position.sector, roundnessSectorFromPosition(1, expectedY));
  });
});

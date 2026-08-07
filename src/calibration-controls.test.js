import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeCalibrationConfirmEdge,
  createCalibrationConfirmLatch,
} from "./calibration-controls.js";

test("Cross and Circle each produce one calibration confirmation edge", () => {
  const latch = createCalibrationConfirmLatch();

  assert.equal(consumeCalibrationConfirmEdge(latch, 1 << 1), true);
  assert.equal(consumeCalibrationConfirmEdge(latch, 1 << 1), false);
  assert.equal(consumeCalibrationConfirmEdge(latch, 0), false);
  assert.equal(consumeCalibrationConfirmEdge(latch, 1 << 2), true);
  assert.equal(consumeCalibrationConfirmEdge(latch, (1 << 1) | (1 << 2)), false);
  assert.equal(consumeCalibrationConfirmEdge(latch, 0), false);
});

test("unrelated controller buttons never confirm calibration", () => {
  const latch = createCalibrationConfirmLatch();
  assert.equal(consumeCalibrationConfirmEdge(latch, 1 << 0), false);
  assert.equal(consumeCalibrationConfirmEdge(latch, 1 << 3), false);
});

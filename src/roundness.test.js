import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRoundnessCapture,
  createRoundnessCapture,
  recordRoundnessSample,
  roundnessTracePoints,
} from "./roundness.js";

test("roundness capture ignores center motion and keeps each sector maximum", () => {
  const empty = createRoundnessCapture();
  assert.equal(recordRoundnessSample(empty, 0.2, 0.2), empty);
  const first = recordRoundnessSample(empty, 0.8, 0);
  const second = recordRoundnessSample(first, 0.95, 0);
  assert.equal(second.sampleCount, 2);
  assert.equal(second.sampleCounts[0], 2);
  assert.equal(second.radii[0], 0.95);
  assert.equal(analyzeRoundnessCapture(second).coverage, 1);
});

test("roundness analysis reports complete unit-circle coverage", () => {
  let capture = createRoundnessCapture();
  for (let index = 0; index < 16; index += 1) {
    const angle = index * Math.PI * 2 / 16;
    capture = recordRoundnessSample(capture, Math.cos(angle), Math.sin(angle));
  }
  const result = analyzeRoundnessCapture(capture);
  assert.equal(result.coverage, 16);
  assert.equal(result.complete, true);
  assert.ok(result.errorPercent < 0.000001);
  assert.equal(roundnessTracePoints(capture).split(" ").length, 16);
});

test("roundness error is mean radial deviation from full scale", () => {
  let capture = createRoundnessCapture();
  for (let index = 0; index < 16; index += 1) {
    const angle = index * Math.PI * 2 / 16;
    const radius = index % 2 ? 0.9 : 1.1;
    capture = recordRoundnessSample(
      capture,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  }
  const result = analyzeRoundnessCapture(capture);
  assert.ok(Math.abs(result.errorPercent - 10) < 0.000001);
  assert.ok(Math.abs(result.minRadius - 0.9) < 0.000001);
  assert.ok(Math.abs(result.maxRadius - 1.1) < 0.000001);
});

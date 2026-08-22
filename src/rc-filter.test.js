import assert from "node:assert/strict";
import test from "node:test";
import {
  STICK_RC_FLAG_BOOST,
  STICK_RC_FLAG_SMOOTHING,
  createDefaultStickRc,
} from "./protocol.js";
import {
  alphaQ15ToCutoffHz,
  cutoffHzToAlphaQ15,
  stickRcFrequencySeries,
  logarithmicFrequencies,
  stickRcResponseAt,
  validateStickRc,
} from "./rc-filter.js";

test("RC cutoff conversion round trips the default frequencies", () => {
  [80, 250, 500, 4000].forEach((frequency) => {
    const roundTrip = alphaQ15ToCutoffHz(cutoffHzToAlphaQ15(frequency));
    assert.ok(Math.abs(roundTrip - frequency) < 1);
  });
});

test("disabled RC stages are unity at every frequency", () => {
  const rc = createDefaultStickRc();
  [1, 80, 500, 4000].forEach((frequency) => {
    const response = stickRcResponseAt(rc, frequency);
    assert.ok(Math.abs(response.smoothingDb) < 1e-9);
    assert.ok(Math.abs(response.boostDb) < 1e-9);
    assert.ok(Math.abs(response.finalDb) < 1e-9);
  });
});

test("every enabled-stage combination remains 0 dB at DC", () => {
  [0, STICK_RC_FLAG_SMOOTHING, STICK_RC_FLAG_BOOST,
    STICK_RC_FLAG_SMOOTHING | STICK_RC_FLAG_BOOST].forEach((flags) => {
    const response = stickRcResponseAt({ ...createDefaultStickRc(), flags }, 0);
    assert.ok(Math.abs(response.smoothingDb) < 1e-9);
    assert.ok(Math.abs(response.boostDb) < 1e-9);
    assert.ok(Math.abs(response.finalDb) < 1e-9);
  });
});

test("default combined RC has a small mid-band peak and attenuates high frequency", () => {
  const rc = createDefaultStickRc();
  rc.flags = STICK_RC_FLAG_SMOOTHING | STICK_RC_FLAG_BOOST;
  const frequencies = logarithmicFrequencies(401);
  const response = frequencies.map((frequency) => stickRcResponseAt(rc, frequency).finalDb);
  const peak = Math.max(...response);
  assert.ok(peak > 0.4 && peak < 0.8);
  assert.ok(stickRcResponseAt(rc, 4000).finalDb < -15);
});

test("RC validation enforces the fast and slow ordering", () => {
  const rc = createDefaultStickRc();
  assert.equal(validateStickRc(rc), true);
  rc.boost_slow_alpha_q15 = rc.boost_fast_alpha_q15;
  assert.equal(validateStickRc(rc), false);
});

test("two independent sticks produce six frequency-response series", () => {
  const series = stickRcFrequencySeries([
    { ...createDefaultStickRc(), flags: STICK_RC_FLAG_SMOOTHING },
    { ...createDefaultStickRc(), flags: STICK_RC_FLAG_BOOST },
  ], [1, 80, 500, 4000]);
  assert.equal(series.length, 6);
  assert.deepEqual(series.map((entry) => entry.stage), [
    "Smoothing", "Boost", "Final", "Smoothing", "Boost", "Final",
  ]);
  assert.ok(series.every((entry) => entry.points.length === 4));
});

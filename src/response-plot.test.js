import test from 'node:test';
import assert from 'node:assert/strict';
import { responseGeometry, gainFromBoundary } from './response-plot.js';
import { createLinearResponse, createDefaultStickRc, Q15_ONE, PROFILE_SIZE, parseProfile, writeProfileDraftToPayload } from './protocol.js';
import { validateStickRc } from './rc-filter.js';

const response = () => ({ ...createLinearResponse(), inner_deadzone_q15: 3277, outer_deadzone_q15: 1638 });
test('physical plot uses proportional deadzones and continuous center gain', () => {
  const r = response();
  const off = responseGeometry(r);
  assert.equal(off.nodes[0].input, 3277 / Q15_ONE);
  assert.equal(off.nodes[0].output, 0);
  assert.equal(off.nodes[8].input, 1 - 1638 / Q15_ONE);
  assert.equal(off.nodes[8].output, 1);
  for (let gain = 1; gain <= 50; gain++) {
    const plot = responseGeometry(r, { anti_deadzone_enabled: 1, anti_deadzone_gain_tenths: gain });
    assert.ok(Math.abs(plot.nodes[0].output - plot.inner * gain / 10) < 1e-12);
    assert.equal(gainFromBoundary(plot.inner, plot.boundary), gain);
    assert.equal(plot.line[0].output, 0);
    assert.ok(plot.line.every((p, i, a) => i === 0 || (p.input >= a[i - 1].input && p.output >= a[i - 1].output)));
  }
});
test('zero inner deadzone ignores gain; saturation adds the actual full-output knee', () => {
  const anti = { anti_deadzone_enabled: 1, anti_deadzone_gain_tenths: 50 };
  assert.deepEqual(responseGeometry(createLinearResponse(), anti).line, responseGeometry(createLinearResponse()).line);
  const plot = responseGeometry({ ...response(), inner_deadzone_q15: 13107 }, anti);
  assert.deepEqual(plot.line[1], { input: 0.2, output: 1 });
  assert.ok(plot.nodes.every((p) => p.output === 1));
  assert.equal(gainFromBoundary(0.1, 0), 0);
  assert.equal(gainFromBoundary(0.1, 1), 50);
});
test('anti-deadzone survives profile encoding independently, preserving unknown bytes', () => {
  const bytes = new Uint8Array(PROFILE_SIZE);
  bytes[340] = 0x5a;
  const left = { ...createDefaultStickRc(), anti_deadzone_enabled: 1, anti_deadzone_gain_tenths: 37 };
  const right = createDefaultStickRc();
  writeProfileDraftToPayload(bytes, {
    flags: 0, color_rgb: [1, 2, 3], pollrate_hz: 8000,
    stick_response: [response(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
    stick_rc: [left, right],
  });
  const parsed = parseProfile(bytes);
  assert.equal(parsed.stick_rc[0].anti_deadzone_gain_tenths, 37);
  assert.equal(parsed.stick_rc[0].anti_deadzone_enabled, 1);
  assert.equal(parsed.stick_rc[1].anti_deadzone_enabled, 0);
  assert.equal(bytes[340], 0x5a);
  assert.equal(validateStickRc(left), true);
  for (const gain of [51, -1, 20.5]) assert.equal(validateStickRc({ ...left, anti_deadzone_gain_tenths: gain }), false);
  assert.equal(validateStickRc({ ...left, anti_deadzone_enabled: 2 }), false);
});

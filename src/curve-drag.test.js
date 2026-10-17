import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computed, ref } from 'vue';
import { Q15_ONE, createLinearResponse } from './protocol.js';
import { responseGeometry, gainFromBoundary, editCurveNode, editInnerBoundary } from './response-plot.js';
import { CURVE_PRESETS, curvePresetToQ15, validateResponse } from './calibration.js';

/** Run the actual SFC gesture handlers with a synthetic SVG viewport. */
function editor(antiConfig = null) {
  const source = readFileSync(new URL('./CurveEditor.vue', import.meta.url), 'utf8')
    .split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\n/gm, '');
  const props = { modelValue: createLinearResponse(), antiConfig, antiSupported: true };
  if (antiConfig) props.modelValue.inner_deadzone_q15 = 3277;
  const events = [];
  const handlers = new Function('computed', 'ref', 'Q15_ONE', 'responseGeometry',
    'gainFromBoundary', 'editCurveNode', 'editInnerBoundary', 'CURVE_PRESETS', 'curvePresetToQ15', 'validateResponse',
    'defineProps', 'defineEmits', source + '\nreturn { chart, geometry, tailPreviewActive, setExactDeadzone, setGain, startDrag, dragPoint, finishDrag, cancelDrag };')(
      computed, ref, Q15_ONE, responseGeometry, gainFromBoundary, editCurveNode, editInnerBoundary,
      CURVE_PRESETS, curvePresetToQ15, validateResponse,
      () => props, () => (name, value) => events.push({ name, value }),
    );
  handlers.chart.value = { getBoundingClientRect: () => ({ top: 0, height: 250, left: 0, width: 440 }),
    setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
  const event = (output) => ({ pointerId: 1, button: 0, clientY: 220 - output * 200 });
  return { handlers, props, events, event };
}

test('tail rescale preserves remaining headroom ratios and the fixed endpoint', () => {
  const points = [0, 6553, 13107, 19660, 22937, 26214, 29490, 31129, Q15_ONE];
  const edited = editCurveNode(points, 2, 0.7);
  for (let i = 3; i < points.length; i++) {
    const expected = Q15_ONE - (Q15_ONE - points[i]) * (Q15_ONE - edited[2]) / (Q15_ONE - points[2]);
    assert.ok(Math.abs(edited[i] - expected) <= 0.5);
  }
  assert.deepEqual(edited.slice(0, 2), points.slice(0, 2));
  assert.equal(edited[8], Q15_ONE);
  assert.deepEqual(editCurveNode(points, 2, 1).slice(2), Array(7).fill(Q15_ONE));
  assert.equal(editCurveNode(points, 2, 0)[2], points[1]);
  assert.deepEqual(editCurveNode(Array(9).fill(Q15_ONE), 2, 1), Array(9).fill(Q15_ONE));
});

test('cross and return previews from the original curve and only commits the selected point', () => {
  const { handlers: h, props, events, event } = editor();
  const original = [...props.modelValue.curve.output_q15];
  h.startDrag(2, event(0.25));
  h.dragPoint(event(0.3));
  assert.equal(h.tailPreviewActive.value, false);
  assert.equal(h.geometry.value.nodes[3].output, original[3] / Q15_ONE);
  h.dragPoint(event(0.8));
  assert.equal(h.tailPreviewActive.value, true);
  assert.ok(h.geometry.value.nodes[3].output > 0.8);
  h.dragPoint(event(0.3));
  assert.equal(h.geometry.value.nodes[3].output, original[3] / Q15_ONE);
  assert.equal(h.tailPreviewActive.value, false);
  assert.deepEqual(props.modelValue.curve.output_q15, original);
  assert.equal(events.length, 0);
  h.finishDrag(event(0.3));
  assert.equal(events.length, 1);
  assert.equal(events[0].value.curve.output_q15[2], Math.round(0.3 * Q15_ONE));
  assert.deepEqual(events[0].value.curve.output_q15.slice(3), original.slice(3));
});

test('release above the original next point commits the proportional tail once', () => {
  const { handlers: h, props, events, event } = editor();
  const expected = editCurveNode(props.modelValue.curve.output_q15, 2, 0.7);
  h.startDrag(2, event(0.25));
  h.dragPoint(event(0.9));
  h.finishDrag(event(0.7));
  assert.deepEqual(events[0].value.curve.output_q15, expected);
  assert.equal(validateResponse(events[0].value), true);
});

test('cancel discards the speculative tail and saturated preview can return', () => {
  const { handlers: h, props, events, event } = editor();
  h.startDrag(2, event(0.25));
  h.dragPoint(event(1));
  h.dragPoint(event(0.25));
  assert.deepEqual(h.geometry.value.nodes.map((p) => Math.round(p.output * Q15_ONE)), props.modelValue.curve.output_q15);
  h.cancelDrag();
  assert.equal(events.length, 0);
});

test('anti-deadzone first node stages only gain; ordinary edits use final-output coordinates', () => {
  const { handlers: h, events, event } = editor({ anti_deadzone_enabled: 1, anti_deadzone_gain_tenths: 20 });
  h.startDrag(0, event(0.2));
  h.dragPoint(event(0.3));
  assert.equal(events.length, 0);
  h.finishDrag(event(0.3));
  assert.equal(events[1].name, 'update:antiConfig');
  assert.equal(events[1].value.anti_deadzone_gain_tenths, 30);
  h.startDrag(2, event(0.4));
  h.finishDrag(event(0.8));
  assert.equal(events[2].name, 'update:modelValue');
  assert.equal(validateResponse(events[2].value), true);
});


test('right endpoint edits output and outer deadzone together', () => {
  const { handlers: h, events, event } = editor();
  h.startDrag(8, { ...event(1), clientX: 420 });
  h.finishDrag({ ...event(0.9), clientX: 54 + 0.8 * 366 });
  assert.equal(events.length, 1);
  assert.ok(Math.abs(events[0].value.outer_deadzone_q15 - 0.2 * Q15_ONE) < 1);
  assert.equal(events[0].value.curve.output_q15[8], Math.round(0.9 * Q15_ONE));
  assert.equal(validateResponse(events[0].value), true);
  assert.equal(responseGeometry(events[0].value).line.at(-1).output, Math.round(0.9 * Q15_ONE) / Q15_ONE);
});


test('inner endpoint moves in both axes, auto-enables gain, and zero disables it', () => {
  const { handlers: h, events, event } = editor({ anti_deadzone_enabled: 0, anti_deadzone_gain_tenths: 20 });
  h.startDrag(0, { ...event(0), clientX: 54 + 0.1 * 366 });
  h.finishDrag({ ...event(0.3), clientX: 54 + 0.15 * 366 });
  assert.equal(events[0].value.inner_deadzone_q15, Math.round(0.15 * Q15_ONE));
  assert.equal(events[1].value.anti_deadzone_enabled, 1);
  assert.equal(events[1].value.anti_deadzone_gain_tenths, 20);
  const disabled = editInnerBoundary(events[0].value, events[1].value, 0.1, 0);
  assert.equal(disabled.anti.anti_deadzone_enabled, 0);
  assert.equal(disabled.anti.anti_deadzone_gain_tenths, 0);
  assert.equal(editInnerBoundary(createLinearResponse(), disabled.anti, 0, 0.2).response.inner_deadzone_q15, Math.round(0.001 * Q15_ONE));
  assert.equal(editInnerBoundary(createLinearResponse(), disabled.anti, 0.1, 0.9).anti.anti_deadzone_gain_tenths, 50);
  assert.equal(editInnerBoundary(createLinearResponse(), disabled.anti, 0.1, 0.01).anti.anti_deadzone_gain_tenths, 1);
  assert.equal(editInnerBoundary(createLinearResponse(), null, 0.2, 0.5).anti, null);
});


test('gain below one is accepted and zero turns anti-deadzone off', () => {
  const { handlers, events } = editor({ anti_deadzone_enabled: 1, anti_deadzone_gain_tenths: 20 });
  handlers.setGain(3);
  assert.equal(events[0].value.anti_deadzone_gain_tenths, 3);
  assert.equal(events[0].value.anti_deadzone_enabled, 1);
  handlers.setGain(0);
  assert.equal(events[1].value.anti_deadzone_enabled, 0);
  assert.equal(events[1].value.anti_deadzone_gain_tenths, 0);
  assert.equal(responseGeometry(createLinearResponse(), events[1].value).active, false);
});

test('dragging close to origin snaps to exact zero instead of maximum gain', () => {
  const { handlers: h, events, event } = editor({ anti_deadzone_enabled: 1, anti_deadzone_gain_tenths: 20 });
  const start = h.geometry.value.nodes[0];
  h.startDrag(0, { ...event(start.output), clientX: 54 + start.input * 366 });
  h.finishDrag({ ...event(0.005), clientX: 55 });
  assert.equal(events[0].value.inner_deadzone_q15, 0);
  assert.equal(events[1].value.anti_deadzone_enabled, 0);
  assert.equal(events[1].value.anti_deadzone_gain_tenths, 0);
  assert.equal(gainFromBoundary(0, 0.01), 0);
  assert.equal(gainFromBoundary(0, 0), 0);
});

test('grabbing the edge of a node without dragging does not change any values', () => {
  const { handlers: h, events } = editor({ anti_deadzone_enabled: 0, anti_deadzone_gain_tenths: 20 });
  const node = h.geometry.value.nodes[0];
  const down = { pointerId: 1, button: 0, clientX: 54 + node.input * 366 + 5, clientY: 217 };
  h.startDrag(0, down);
  h.finishDrag({ ...down, clientX: down.clientX + 0.5, clientY: 216.5 });
  assert.equal(events.length, 0);
});

test('layout movement and unrelated capture events cannot swallow an active gesture', () => {
  const { handlers: h, events, event } = editor();
  h.startDrag(2, event(0.25));
  h.chart.value.getBoundingClientRect = () => ({ top: 100, left: 100, height: 500, width: 880 });
  h.cancelDrag({ type: 'lostpointercapture', pointerId: 2 });
  h.cancelDrag({ type: 'lostpointercapture', pointerId: 1 });
  h.finishDrag(event(0.7));
  assert.equal(events.length, 1);
  assert.ok(Math.abs(events[0].value.curve.output_q15[2] / Q15_ONE - 0.7) < 0.0001);
  h.startDrag(3, event(0.375));
  h.finishDrag(event(0.8));
  assert.equal(events.length, 2);
});


test('precise deadzone inputs retain rounding and bounds alongside curve dragging', () => {
  const { handlers, events } = editor();
  for (const [field, value, expected] of [
    ['inner_deadzone_q15', 12.34, 12.3],
    ['outer_deadzone_q15', 99, 40],
    ['inner_deadzone_q15', -1, 0],
  ]) {
    const target = { valueAsNumber: value };
    handlers.setExactDeadzone(field, {target});
    assert.equal(target.value, expected);
    assert.equal(events.at(-1).value[field], Math.round(expected / 100 * Q15_ONE));
  }
  handlers.setExactDeadzone('inner_deadzone_q15', {target:{valueAsNumber:NaN}});
  assert.equal(events.length, 3);
});

test('older firmware locks new curve endpoint and anti-deadzone controls', () => {
  const { handlers, props, events, event } = editor({anti_deadzone_enabled:0, anti_deadzone_gain_tenths:0});
  props.antiSupported = false;
  for (const index of [0, 8]) {
    handlers.startDrag(index, event(0.5));
    handlers.finishDrag(event(0.7));
  }
  handlers.setGain(20);
  assert.equal(events.length, 0);
  handlers.startDrag(2, event(0.25));
  handlers.finishDrag(event(0.3));
  assert.equal(events.length, 1);
  assert.equal(events[0].value.curve.output_q15[8], Q15_ONE);
});

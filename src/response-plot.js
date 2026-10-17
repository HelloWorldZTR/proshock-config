import { Q15_ONE } from './protocol.js';

/** Physical input coordinates and final radial outputs shared by plot and editing. */
export function responseGeometry(response, anti = null) {
  const inner = response.inner_deadzone_q15 / Q15_ONE;
  const outer = 1 - response.outer_deadzone_q15 / Q15_ONE;
  const gain = (anti?.anti_deadzone_gain_tenths ?? 20) / 10;
  const active = Boolean(anti?.anti_deadzone_enabled && inner > 0 && gain > 0);
  const boundary = active ? Math.min(1, inner * gain) : 0;
  const nodes = response.curve.output_q15.map((value, index) => ({
    index, input: inner + (outer - inner) * index / 8,
    output: boundary + (1 - boundary) * value / Q15_ONE,
  }));
  const line = [{ input: 0, output: 0 }];
  if (active && inner * gain > 1) line.push({ input: 1 / gain, output: 1 });
  line.push(...nodes, { input: 1, output: nodes.at(-1).output });
  return { inner, outer, gain, active, boundary, nodes, line };
}

/** Convert a boundary drag to a bounded gain in tenths. */
export function gainFromBoundary(inner, output) {
  if (!Number.isFinite(inner) || !Number.isFinite(output) || inner <= 0 || output <= 0) return 0;
  return Math.max(0, Math.min(50, Math.round(output / inner * 10)));
}

/** @brief Preview an upward tail rescale from a fixed gesture-start curve.
 * Commit the tail only when the released node exceeds its original successor.
 */
export function editCurveNode(points, index, ratio) {
  const next = [...points];
  if (index <= 0 || index >= points.length || !Number.isFinite(ratio)) return next;
  const original = points[index];
  const value = Math.max(points[index - 1], Math.min(Q15_ONE, Math.round(ratio * Q15_ONE)));
  next[index] = value;
  const scaleTail = value > original && value > points[index + 1];
  if (scaleTail && original < Q15_ONE) {
    for (let i = index + 1; i < points.length; i++) {
      next[i] = Q15_ONE - Math.round(
        (Q15_ONE - points[i]) * (Q15_ONE - value) / (Q15_ONE - original),
      );
    }
  }
  return next;
}

/** @brief Edit the inner boundary while keeping center gain between 0x and 5x. */
export function editInnerBoundary(response, anti, input, output) {
  const next = { ...response };
  if (Number.isFinite(input)) next.inner_deadzone_q15 = Math.round(
    Math.max(0, Math.min(0.4, input)) * Q15_ONE);
  const settings = anti ? { ...anti } : null;
  if (settings && Number.isFinite(output)) {
    settings.anti_deadzone_enabled = output > 0 ? 1 : 0;
    if (output <= 0) settings.anti_deadzone_gain_tenths = 0;
    if (output > 0) {
      if (next.inner_deadzone_q15 === 0) next.inner_deadzone_q15 = Math.round(0.001 * Q15_ONE);
      settings.anti_deadzone_gain_tenths = gainFromBoundary(next.inner_deadzone_q15 / Q15_ONE, output);
      settings.anti_deadzone_enabled = Number(settings.anti_deadzone_gain_tenths > 0);
    }
  }
  return { response: next, anti: settings };
}

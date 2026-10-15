import { Q15_ONE } from './protocol.js';

/** Physical input coordinates and final radial outputs shared by plot and editing. */
export function responseGeometry(response, anti = null) {
  const inner = response.inner_deadzone_q15 / Q15_ONE;
  const outer = 1 - response.outer_deadzone_q15 / Q15_ONE;
  const gain = (anti?.anti_deadzone_gain_tenths || 20) / 10;
  const active = Boolean(anti?.anti_deadzone_enabled && inner > 0);
  const boundary = active ? Math.min(1, inner * gain) : 0;
  const nodes = response.curve.output_q15.map((value, index) => ({
    index, input: inner + (outer - inner) * index / 8,
    output: boundary + (1 - boundary) * value / Q15_ONE,
  }));
  const line = [{ input: 0, output: 0 }];
  if (active && inner * gain > 1) line.push({ input: 1 / gain, output: 1 });
  line.push(...nodes, { input: 1, output: 1 });
  return { inner, outer, gain, active, boundary, nodes, line };
}

/** Convert a boundary drag to a bounded gain in tenths. */
export function gainFromBoundary(inner, output) {
  return Math.max(10, Math.min(50, Math.round(output / inner * 10)));
}

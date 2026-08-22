export const USER_SHAPE_Q15_DEFAULT = 32768;
export const USER_SHAPE_Q15_MIN = 0;
export const USER_SHAPE_Q15_MAX = 0xffff;
export const USER_SHAPE_DRAG_MIN = 0.5;
export const USER_SHAPE_DRAG_MAX = 1.25;
export const USER_SHAPE_PRESET = Object.freeze({
  CIRCLE: "circle",
  SQUARE: "square",
  OCTAGON: "octagon",
  CUSTOM: "custom",
});

/**
 * Clamp one directly edited Profile shape value to an unsigned 16-bit word.
 */
export function clampUserShapeQ15(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return USER_SHAPE_Q15_DEFAULT;
  }
  return Math.max(
    USER_SHAPE_Q15_MIN,
    Math.min(USER_SHAPE_Q15_MAX, Math.round(numeric)),
  );
}

/**
 * Build one 16-sector target shape in the firmware's post-flip coordinates.
 *
 * Square and octagon presets are inscribed in the unit circle so the firmware
 * can reproduce every boundary without relying on radial values above 1.0.
 */
export function createUserShapePreset(preset) {
  if (preset === USER_SHAPE_PRESET.SQUARE) {
    const halfExtent = 1 / Math.sqrt(2);
    return Array.from({ length: 16 }, (_, sector) => {
      const angle = sector * Math.PI * 2 / 16;
      const boundary = halfExtent / Math.max(
        Math.abs(Math.cos(angle)),
        Math.abs(Math.sin(angle)),
      );
      return Math.round(boundary * USER_SHAPE_Q15_DEFAULT);
    });
  }
  if (preset === USER_SHAPE_PRESET.OCTAGON) {
    return Array.from({ length: 16 }, (_, sector) => (
      Math.round(
        (sector % 2 === 0 ? 1 : Math.cos(Math.PI / 8))
        * USER_SHAPE_Q15_DEFAULT,
      )
    ));
  }
  return Array(16).fill(USER_SHAPE_Q15_DEFAULT);
}

/** Determine whether sector values exactly match a built-in preset. */
export function detectUserShapePreset(values, tolerance = 1) {
  for (const preset of [
    USER_SHAPE_PRESET.CIRCLE,
    USER_SHAPE_PRESET.SQUARE,
    USER_SHAPE_PRESET.OCTAGON,
  ]) {
    const expected = createUserShapePreset(preset);
    if (
      Array.isArray(values)
      && expected.every((value, index) => (
        Math.abs(Number(values[index]) - value) <= tolerance
      ))
    ) {
      return preset;
    }
  }
  return USER_SHAPE_PRESET.CUSTOM;
}

/** Convert a pointer radius into the bounded Q1.15 value used by the editor. */
export function userShapeQ15FromRadius(radius) {
  const numeric = Number(radius);
  if (!Number.isFinite(numeric)) return USER_SHAPE_Q15_DEFAULT;
  return Math.round(
    Math.max(USER_SHAPE_DRAG_MIN, Math.min(USER_SHAPE_DRAG_MAX, numeric))
    * USER_SHAPE_Q15_DEFAULT,
  );
}

/** Convert one firmware sector table into an SVG polygon point list. */
export function userShapeTracePoints(values, scale = 100) {
  const source = Array.isArray(values) ? values : [];
  return Array.from({ length: 16 }, (_, sector) => {
    const radius = clampUserShapeQ15(
      source[sector] ?? USER_SHAPE_Q15_DEFAULT,
    ) / USER_SHAPE_Q15_DEFAULT;
    const angle = sector * Math.PI * 2 / 16;
    return `${(Math.cos(angle) * radius * scale).toFixed(2)},${(
      Math.sin(angle) * radius * scale
    ).toFixed(2)}`;
  }).join(" ");
}

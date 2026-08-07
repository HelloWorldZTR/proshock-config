export const USER_SHAPE_Q15_DEFAULT = 32768;
export const USER_SHAPE_Q15_MIN = 0;
export const USER_SHAPE_Q15_MAX = 0xffff;

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

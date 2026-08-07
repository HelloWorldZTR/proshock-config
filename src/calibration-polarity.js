/**
 * Axis polarity used by firmware versions that predate WebHID polarity data.
 */
export const LEGACY_CALIBRATION_AXIS_INVERT = Object.freeze([
  false,
  false,
  false,
  false,
]);

/**
 * Return the output-coordinate sign applied to one raw calibrated axis.
 */
export function calibrationAxisSign(
  axisIndex,
  axisInvert = LEGACY_CALIBRATION_AXIS_INVERT,
) {
  return axisInvert?.[axisIndex] ? -1 : 1;
}

/**
 * Decode the firmware bit mask into LX, LY, RX, and RY booleans.
 */
export function calibrationAxisInvertFromMask(mask) {
  return Array.from({ length: 4 }, (_, axisIndex) => (
    (Number(mask) & (1 << axisIndex)) !== 0
  ));
}

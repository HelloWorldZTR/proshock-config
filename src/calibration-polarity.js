/**
 * Temporary prototype-board calibration polarity.
 *
 * Each entry mirrors the firmware runtime `axis.invert` value for
 * LX, LY, RX, and RY. The current hand-built PCB has both Y potentiometers
 * wired in the opposite direction, so its firmware disables the historical
 * LY/RY inversion and this frontend must do the same while assigning
 * calibration directions and roundness sectors.
 *
 * TODO: Restore the production-board values to [false, true, false, true]
 * when the corrected PCB replaces the prototype.
 */
export const TEMPORARY_CALIBRATION_AXIS_INVERT = Object.freeze([
  false,
  false,
  false,
  false,
]);

/**
 * Return the output-coordinate sign applied to one raw calibrated axis.
 */
export function calibrationAxisSign(axisIndex) {
  return TEMPORARY_CALIBRATION_AXIS_INVERT[axisIndex] ? -1 : 1;
}

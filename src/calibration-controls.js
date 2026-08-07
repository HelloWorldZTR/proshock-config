export const CALIBRATION_CONFIRM_BUTTON_MASK = (1 << 1) | (1 << 2);

/**
 * Create the edge latch shared by every calibration stage.
 */
export function createCalibrationConfirmLatch() {
  return { pressed: false };
}

/**
 * Consume a Cross/Circle button state and report only a new press edge.
 */
export function consumeCalibrationConfirmEdge(latch, buttons = 0) {
  const pressed = (buttons & CALIBRATION_CONFIRM_BUTTON_MASK) !== 0;
  const risingEdge = pressed && !latch.pressed;
  latch.pressed = pressed;
  return risingEdge;
}

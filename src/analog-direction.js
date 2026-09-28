import { cloneConfigData } from "./clone-data.js";
import { calibrationAxisInvertFromMask } from "./calibration-polarity.js";

/** @brief Resolve canonical axis signs without interpreting V1 reserved bytes. */
export function analogAxisInvert(calibration, legacyAxisInvert) {
  return calibration?.calibration_version >= 2
    ? calibrationAxisInvertFromMask(calibration.direction_mask)
    : legacyAxisInvert;
}

/** @brief Reflect physical sector data once; retain numeric ADC bounds and Profile data. */
export function changeAnalogDirection(calibration, channel, inverted) {
  if (calibration.calibration_version !== 2 || !Number.isInteger(channel) || channel < 0 || channel > 5) {
    throw new Error("Configurable analog directions require calibration V2.");
  }
  const draft = cloneConfigData(calibration);
  const bit = 1 << channel;
  const mask = inverted ? draft.direction_mask | bit : draft.direction_mask & ~bit;
  if (mask === draft.direction_mask) return draft;

  // Sector zero is right, increasing clockwise in canonical Y-down coordinates.
  if (channel < 4) {
    const stick = draft.stick[Math.floor(channel / 2)];
    const original = [...stick.radius_q15];
    original.forEach((radius, source) => {
      const destination = channel % 2 === 0 ? (8 - source + 16) % 16 : (16 - source) % 16;
      stick.radius_q15[destination] = radius;
    });
  } else {
    const trigger = draft.trigger[channel - 4];
    [trigger.raw_released, trigger.raw_pressed] = [trigger.raw_pressed, trigger.raw_released];
  }
  draft.direction_mask = mask;
  return draft;
}

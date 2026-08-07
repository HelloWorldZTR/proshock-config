/**
 * Build the live processed-input model from the firmware-owned analog snapshot.
 *
 * GET_RAW_INPUT is intentionally not accepted here. After calibration is
 * applied, calibrated Q15, response output, and HID values must all come from
 * the same firmware sequence.
 */
export function createLiveInputSnapshot(firmwareSnapshot) {
  if (!firmwareSnapshot?.raw_adc || !firmwareSnapshot?.hid) return null;
  return {
    ...firmwareSnapshot,
    raw_adc: [...firmwareSnapshot.raw_adc],
    calibrated_stick_q15: [...firmwareSnapshot.calibrated_stick_q15],
    calibrated_trigger_q15: [...firmwareSnapshot.calibrated_trigger_q15],
    output_stick_q15: [...firmwareSnapshot.output_stick_q15],
    output_trigger_q15: [...firmwareSnapshot.output_trigger_q15],
    hid: [...firmwareSnapshot.hid],
    source: "firmware-analog-snapshot",
  };
}

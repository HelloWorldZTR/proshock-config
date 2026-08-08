import { Q15_ONE } from "./protocol.js";

const AXIS_COUNT = 4;
const DS4_BUTTON_MAP = [
  [2, 0],  // Square
  [0, 1],  // Cross
  [1, 2],  // Circle
  [3, 3],  // Triangle
  [4, 4],  // L1
  [5, 5],  // R1
  [6, 6],  // L2
  [7, 7],  // R2
  [8, 8],  // Create / Share
  [9, 9],  // Options
  [10, 10], // L3
  [11, 11], // R3
  [16, 12], // PS
  [17, 13], // Touchpad
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function buttonPressed(button) {
  return !!button?.pressed;
}

function buttonValue(button) {
  return clamp(button?.value, 0, 1);
}

function axisQ15(value) {
  return Math.round(clamp(value, -1, 1) * Q15_ONE);
}

function axisByte(value) {
  const normalized = clamp(value, -1, 1);
  return normalized < 0
    ? 128 - Math.round(-normalized * 128)
    : 128 + Math.round(normalized * 127);
}

function triggerQ15(value) {
  return Math.round(buttonValue(value) * Q15_ONE);
}

function triggerByte(value) {
  return Math.round(buttonValue(value) * 255);
}

function dpadHat(buttons) {
  const up = buttonPressed(buttons[12]);
  const down = buttonPressed(buttons[13]);
  const left = buttonPressed(buttons[14]);
  const right = buttonPressed(buttons[15]);
  const vertical = up !== down ? (up ? 1 : 2) : 0;
  const horizontal = left !== right ? (right ? 1 : 2) : 0;

  if (vertical === 1) return horizontal === 1 ? 1 : horizontal === 2 ? 7 : 0;
  if (vertical === 2) return horizontal === 1 ? 3 : horizontal === 2 ? 5 : 4;
  if (horizontal === 1) return 2;
  if (horizontal === 2) return 6;
  return 8;
}

/**
 * Return whether a Gamepad API entry looks like the selected DS4-compatible
 * controller family.
 */
export function isProShockPreviewGamepad(gamepad) {
  if (!gamepad?.connected) return false;
  const id = String(gamepad.id || "").toLowerCase();
  return (id.includes("054c") && id.includes("09cc"))
    || id.includes("wireless controller")
    || id.includes("proshock");
}

/**
 * Convert one browser-owned Gamepad API snapshot into the Portal preview
 * fields without opening a high-rate WebHID input-report stream.
 */
export function createGamepadPreviewSnapshot(gamepad) {
  if (!gamepad || gamepad.axes.length < AXIS_COUNT) {
    throw new Error("Gamepad preview requires four stick axes.");
  }
  const axes = Array.from(gamepad.axes.slice(0, AXIS_COUNT));
  const buttons = gamepad.buttons || [];
  let buttonMask = 0;

  DS4_BUTTON_MAP.forEach(([gamepadIndex, ds4Bit]) => {
    if (buttonPressed(buttons[gamepadIndex])) buttonMask |= 1 << ds4Bit;
  });

  const leftTrigger = buttons[6];
  const rightTrigger = buttons[7];
  return {
    buttons: buttonMask,
    dpad_hat: dpadHat(buttons),
    hid: [
      ...axes.map(axisByte),
      triggerByte(leftTrigger),
      triggerByte(rightTrigger),
    ],
    output_stick_q15: axes.map(axisQ15),
    output_trigger_q15: [triggerQ15(leftTrigger), triggerQ15(rightTrigger)],
  };
}

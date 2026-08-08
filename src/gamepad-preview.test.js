import assert from "node:assert/strict";
import test from "node:test";

import {
  createGamepadPreviewSnapshot,
  isProShockPreviewGamepad,
} from "./gamepad-preview.js";

function buttons() {
  return Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }));
}

test("preview recognizes DS4-compatible Gamepad API entries", () => {
  assert.equal(isProShockPreviewGamepad({
    connected: true,
    id: "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)",
  }), true);
  assert.equal(isProShockPreviewGamepad({ connected: true, id: "Other Pad" }), false);
});

test("Gamepad API snapshot maps standard buttons into DS4 preview fields", () => {
  const gamepadButtons = buttons();
  [0, 2, 4, 6, 12, 15, 16, 17].forEach((index) => {
    gamepadButtons[index].pressed = true;
  });
  gamepadButtons[6].value = 0.25;
  gamepadButtons[7].value = 1;

  assert.deepEqual(createGamepadPreviewSnapshot({
    axes: [-1, 0, 1, -0.5],
    buttons: gamepadButtons,
  }), {
    buttons: 0x3053,
    dpad_hat: 1,
    hid: [0, 128, 255, 64, 64, 255],
    output_stick_q15: [-32767, 0, 32767, -16383],
    output_trigger_q15: [8192, 32767],
  });
});

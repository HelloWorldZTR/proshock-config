import test from "node:test";
import assert from "node:assert/strict";
import {
  USER_SHAPE_Q15_DEFAULT,
  USER_SHAPE_Q15_MAX,
  USER_SHAPE_PRESET,
  clampUserShapeQ15,
  createLatestFrameUpdate,
  createUserShapePreset,
  detectUserShapePreset,
  userShapeQ15FromRadius,
  userShapeTracePoints,
} from "./roundness-editor.js";

test("drag updates publish only the latest sample in each animation frame", () => {
  const callbacks = new Map();
  const published = [];
  let nextFrameId = 1;
  const updates = createLatestFrameUpdate(
    (callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    },
    (frameId) => callbacks.delete(frameId),
    (value) => published.push(value),
  );

  updates.push({ radius: 0.75 });
  updates.push({ radius: 1.0 });
  updates.push({ radius: 1.25 });
  assert.equal(callbacks.size, 1);
  callbacks.get(1)();
  assert.deepEqual(published, [{ radius: 1.25 }]);

  updates.push({ radius: 0.8 });
  updates.flush();
  assert.equal(callbacks.has(2), false);
  assert.deepEqual(published, [{ radius: 1.25 }, { radius: 0.8 }]);

  updates.push({ radius: 0.9 });
  updates.cancel();
  assert.equal(callbacks.has(3), false);
  assert.equal(published.length, 2);
});

test("advanced stick shape exposes raw unsigned Q1.15 words", () => {
  assert.equal(clampUserShapeQ15(0), 0);
  assert.equal(clampUserShapeQ15(32768), USER_SHAPE_Q15_DEFAULT);
  assert.equal(clampUserShapeQ15(65535), USER_SHAPE_Q15_MAX);
  assert.equal(clampUserShapeQ15(-1), 0);
  assert.equal(clampUserShapeQ15(70000), USER_SHAPE_Q15_MAX);
  assert.equal(clampUserShapeQ15("invalid"), USER_SHAPE_Q15_DEFAULT);
});

test("built-in shapes are inscribed, symmetric, and detectable", () => {
  const circle = createUserShapePreset(USER_SHAPE_PRESET.CIRCLE);
  const squircle = createUserShapePreset(USER_SHAPE_PRESET.SQUIRCLE);
  const square = createUserShapePreset(USER_SHAPE_PRESET.SQUARE);
  const octagon = createUserShapePreset(USER_SHAPE_PRESET.OCTAGON);

  assert.deepEqual(circle, Array(16).fill(USER_SHAPE_Q15_DEFAULT));
  assert.deepEqual(squircle, [
    27554, 29609, 32768, 29609,
    27554, 29609, 32768, 29609,
    27554, 29609, 32768, 29609,
    27554, 29609, 32768, 29609,
  ]);
  assert.equal(squircle[2], USER_SHAPE_Q15_DEFAULT);
  assert.equal(squircle[0], squircle[4]);
  squircle.forEach((value, sector) => {
    assert.ok(value >= square[sector]);
    assert.ok(value <= circle[sector]);
  });
  assert.equal(
    detectUserShapePreset(squircle),
    USER_SHAPE_PRESET.SQUIRCLE,
  );
  assert.equal(square[0], square[4]);
  assert.equal(square[2], USER_SHAPE_Q15_DEFAULT);
  assert.ok(square[0] < square[1] && square[1] < square[2]);
  assert.equal(octagon[0], USER_SHAPE_Q15_DEFAULT);
  assert.ok(octagon[1] < octagon[0]);
  assert.equal(octagon[1], octagon[3]);
  assert.equal(detectUserShapePreset(square), USER_SHAPE_PRESET.SQUARE);
  square[0] += 50;
  assert.equal(detectUserShapePreset(square), USER_SHAPE_PRESET.CUSTOM);
});

test("drag radii use a safe visual range and generate 16 SVG points", () => {
  assert.equal(userShapeQ15FromRadius(0), 16384);
  assert.equal(userShapeQ15FromRadius(1), USER_SHAPE_Q15_DEFAULT);
  assert.equal(userShapeQ15FromRadius(2), 40960);
  assert.equal(
    userShapeTracePoints(createUserShapePreset(USER_SHAPE_PRESET.CIRCLE))
      .split(" ").length,
    16,
  );
});

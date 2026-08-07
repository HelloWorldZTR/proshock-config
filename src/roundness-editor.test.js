import test from "node:test";
import assert from "node:assert/strict";
import {
  USER_SHAPE_Q15_DEFAULT,
  USER_SHAPE_Q15_MAX,
  clampUserShapeQ15,
} from "./roundness-editor.js";

test("advanced stick shape exposes raw unsigned Q1.15 words", () => {
  assert.equal(clampUserShapeQ15(0), 0);
  assert.equal(clampUserShapeQ15(32768), USER_SHAPE_Q15_DEFAULT);
  assert.equal(clampUserShapeQ15(65535), USER_SHAPE_Q15_MAX);
  assert.equal(clampUserShapeQ15(-1), 0);
  assert.equal(clampUserShapeQ15(70000), USER_SHAPE_Q15_MAX);
  assert.equal(clampUserShapeQ15("invalid"), USER_SHAPE_Q15_DEFAULT);
});

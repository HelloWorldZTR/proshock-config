import assert from "node:assert/strict";
import test from "node:test";
import { availableLocales, translate } from "./i18n.js";
import "./locales/zh-CN.js";

test("English remains the canonical fallback and Chinese is registered", () => {
  assert.equal(translate("Home", "en"), "Home");
  assert.equal(translate("Home", "zh-CN"), "首页");
  assert.deepEqual(availableLocales().map((item) => item.code), ["en", "zh-CN"]);
});

test("source-message placeholders preserve runtime values", () => {
  assert.equal(translate("Slot 4", "zh-CN"), "槽位 4");
  assert.equal(translate("37/4 returns recorded", "zh-CN"), "已记录 37/4 次回中");
  assert.equal(translate("Untranslated firmware status", "zh-CN"), "Untranslated firmware status");
});

test("physical controller labels match the artwork in every locale", () => {
  [
    "Square", "Cross", "Circle", "Triangle", "Create", "Share", "Options",
    "Touchpad", "Trackpad", "D-pad", "D-pad Up", "D-pad Right",
    "D-pad Down", "D-pad Left",
  ].forEach((label) => assert.equal(translate(label, "zh-CN"), label));
});

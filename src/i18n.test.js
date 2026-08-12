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
  assert.equal(
    translate("3/4 returns recorded · 16/16 ready", "zh-CN"),
    "已记录 3/4 次回中 · 待采样窗口 16/16",
  );
  assert.equal(translate("7/16 adjusted", "zh-CN"), "已调整 7/16");
  assert.equal(
    translate("Left stick sector 12 raw value", "zh-CN"),
    "Left stick扇区 12 原始数值",
  );
  assert.equal(translate("Untranslated firmware status", "zh-CN"), "Untranslated firmware status");
});

test("physical controller labels match the artwork in every locale", () => {
  [
    "Square", "Cross", "Circle", "Triangle", "Create", "Share", "Options",
    "Touchpad", "Trackpad", "D-pad", "D-pad Up", "D-pad Right",
    "D-pad Down", "D-pad Left",
  ].forEach((label) => assert.equal(translate(label, "zh-CN"), label));
});

test("firmware progress safety warning is available in Chinese", () => {
  assert.equal(
    translate("Do not disconnect USB during the upgrade", "zh-CN"),
    "升级期间请勿断开 USB",
  );
  assert.equal(
    translate("Back to firmware selection", "zh-CN"),
    "返回固件选择",
  );
});

test("right-corner notifications are available in Chinese", () => {
  const notifications = [
    "Profile exported without physical calibration.",
    "Full device backup exported.",
    "Profile imported to Slot 2 as a draft.",
    "Controller reconnected. Unsaved work was preserved.",
    "WebHID disconnected. The game controller remains available.",
    "WebHID disconnected. Unsaved work was preserved in this page.",
    "WebHID disconnected. The game controller may remain available.",
    "Draft applied to firmware RAM.",
    "Configuration saved and verified.",
    "Applied changes were rolled back to the saved configuration.",
    "This browser does not support WebHID.",
    "The selected controller does not expose configuration Feature Report 0xF0.",
    "Device is not connected.",
    "Another request is already in flight.",
    "Timed out waiting for WebHID response.",
    "Drained stale WebHID transaction 7 while waiting for 8.",
    "Unexpected WebHID protocol version 3.",
    "Unexpected WebHID response 0x10 while waiting for 0x11.",
    "Chunk metadata mismatch.",
    "Profile file is not valid JSON.",
    "File is not a ProShock document.",
    "Unknown file format.",
    "This file was created by a newer tool version.",
    "File checksum does not match.",
    "Choose a Profile file, not a full device backup.",
    "Profile must be 668 bytes.",
    "Profile version requires an explicit migration.",
    "Profile contains an invalid response curve.",
    "Profile contains an invalid Resolver configuration.",
    "command 0x14: BAD_CONFIG",
    "Unexpected analog snapshot size: 52",
  ];

  notifications.forEach((message) => {
    assert.notEqual(translate(message, "zh-CN"), message, message);
  });
});

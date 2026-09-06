import assert from "node:assert/strict";
import test from "node:test";
import { availableLocales, translate, selectInitialLocale } from "./i18n.js";
import "./locales/zh-CN.js";

test("English remains the canonical fallback and Chinese is registered", () => {
  assert.equal(translate("Home", "en"), "Home");
  assert.equal(translate("Home", "zh-CN"), "首页");
  assert.deepEqual(availableLocales().map((item) => item.code), ["en", "zh-CN"]);
});

test("competitive-play risk warning is available in Chinese", () => {
  assert.equal(translate("Online-play ban risk", "zh-CN"), "在线游戏封号风险");
  assert.equal(
    translate(
      "Macros and RC filtering may violate game or tournament rules. Use them at your own risk; account bans are your responsibility.",
      "zh-CN",
    ),
    "宏功能和 RC 滤波可能违反游戏或赛事规则；使用后导致封号，后果自负。",
  );
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

test("analog calibration modes and progress are available in Chinese", () => {
  assert.equal(translate("Analog Calibration", "zh-CN"), "校准");
  assert.equal(translate("Quick · Default", "zh-CN"), "快速 · 默认");
  assert.equal(
    translate("2/4 returns recorded · 7/16 center samples", "zh-CN"),
    "已记录 2/4 次回中 · 中心样本 7/16",
  );
});

test("Configurator Apply action and states are available in Chinese", () => {
  assert.equal(translate("Apply current settings", "zh-CN"), "应用当前设置");
  assert.equal(translate("Applying…", "zh-CN"), "正在应用…");
  assert.equal(translate("Current settings", "zh-CN"), "当前设置");
  assert.notEqual(
    translate("Apply sends current changes to firmware RAM. Save persists them to flash.", "zh-CN"),
    "Apply sends current changes to firmware RAM. Save persists them to flash.",
  );
});

test("button debounce control is available in Chinese", () => {
  assert.equal(translate("Button response", "zh-CN"), "按键响应");
  assert.equal(translate("Button debounce", "zh-CN"), "按键消抖");
  assert.equal(translate("Button debounce duration", "zh-CN"), "按键消抖时间");
  assert.equal(translate("4 ms · 32 samples", "zh-CN"), "4 ms · 32 个样本");
});

test("rounded-square stick mode is available in Chinese", () => {
  assert.equal(translate("Rounded square", "zh-CN"), "方圆形");
  assert.equal(translate("Rounded-square preset", "zh-CN"), "方圆形预设");
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
    "Connect the controller before opening Analog Calibration.",
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

test("macro editing and recording feedback are localized without translating controller labels", () => {
  assert.equal(translate("Complete editing", "zh-CN"), "完成编辑");
  assert.equal(translate("Remaining steps: 3", "zh-CN"), "剩余步骤：3");
  assert.equal(translate("Stored duration: 8 ms", "zh-CN"), "实际存储时长：8 毫秒");
  assert.equal(translate("Step 2: Enter a duration from 4 to 1020 ms.", "zh-CN"), "步骤 2：请输入 4–1020 毫秒的时长。");
  assert.equal(translate("Controller disconnected. Recording stopped; captured steps were preserved.", "zh-CN"), "手柄已断开，录制已停止，已捕获的步骤已保留。");
});

test("initial locale follows supported browser preferences unless manually selected", () => {
  assert.equal(selectInitialLocale("", ["zh-CN", "en-US"]), "zh-CN");
  assert.equal(selectInitialLocale("", ["en-US", "zh-CN"]), "en");
  assert.equal(selectInitialLocale("", ["fr-FR", "zh-TW"]), "zh-CN");
  assert.equal(selectInitialLocale("en", ["zh-CN"]), "en");
  assert.equal(selectInitialLocale("invalid", ["zh-Hans-CN"]), "zh-CN");
  assert.equal(selectInitialLocale("", ["fr-FR"]), "en");
  assert.equal(selectInitialLocale("", []), "en");
});

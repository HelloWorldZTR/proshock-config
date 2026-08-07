import test from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_ACTION,
  LEAVE_GUARD_KIND,
  deriveHeaderState,
  deriveLeaveGuardKind,
  shouldGuardNavigation,
} from "./app-shell-state.js";

function header(overrides = {}) {
  return deriveHeaderState({
    connected: true,
    busy: false,
    saving: false,
    hasApplyDraft: false,
    applyValid: true,
    ramDirty: false,
    calibrationOwnsActions: false,
    hasUnsaved: false,
    ...overrides,
  });
}

test("header exposes exactly one sequential action", () => {
  assert.equal(header({ connected: false }).action, HEADER_ACTION.CONNECT);
  assert.equal(header({ hasApplyDraft: true }).action, HEADER_ACTION.APPLY);
  assert.equal(header({ ramDirty: true }).action, HEADER_ACTION.SAVE);
  assert.equal(header().action, null);
});

test("invalid drafts and calibration never expose save early", () => {
  const invalid = header({ hasApplyDraft: true, applyValid: false });
  assert.equal(invalid.mode, "invalid");
  assert.equal(invalid.action, null);

  const calibration = header({
    calibrationOwnsActions: true,
    ramDirty: true,
  });
  assert.equal(calibration.mode, "calibration");
  assert.equal(calibration.action, null);
});

test("busy and reconnect states override normal actions", () => {
  assert.equal(header({ busy: true, ramDirty: true }).mode, "busy");
  assert.equal(header({ busy: true, saving: true }).mode, "saving");
  assert.equal(header({
    connected: false,
    hasUnsaved: true,
  }).label, "Reconnect");
});

test("leave guard prioritizes drafts, calibration, then applied RAM", () => {
  assert.equal(deriveLeaveGuardKind({
    hasApplyDraft: true,
    calibrationPending: true,
    ramDirty: true,
  }), LEAVE_GUARD_KIND.DRAFT);
  assert.equal(deriveLeaveGuardKind({
    hasApplyDraft: false,
    calibrationPending: true,
    ramDirty: true,
  }), LEAVE_GUARD_KIND.CALIBRATION);
  assert.equal(deriveLeaveGuardKind({
    hasApplyDraft: false,
    calibrationPending: false,
    ramDirty: true,
  }), LEAVE_GUARD_KIND.APPLIED);
  assert.equal(deriveLeaveGuardKind({
    hasApplyDraft: false,
    calibrationPending: false,
    ramDirty: false,
  }), LEAVE_GUARD_KIND.NONE);
});

test("navigation guard allows unsaved navigation inside the current Profile", () => {
  assert.equal(shouldGuardNavigation({
    hasUnsaved: true,
    currentProfile: 0,
    targetProfile: 0,
  }), false);
  assert.equal(shouldGuardNavigation({
    hasUnsaved: true,
    currentProfile: 0,
    targetProfile: 1,
  }), true);
  assert.equal(shouldGuardNavigation({
    hasUnsaved: true,
    currentProfile: 0,
    destructive: true,
  }), true);
});

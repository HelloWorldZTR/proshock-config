export const HEADER_ACTION = Object.freeze({
  CONNECT: "connect",
  APPLY: "apply",
  SAVE: "save",
});

export const LEAVE_GUARD_KIND = Object.freeze({
  NONE: "none",
  DRAFT: "draft",
  CALIBRATION: "calibration",
  APPLIED: "applied",
});

/**
 * Derive the single global header status and its only available primary action.
 */
export function deriveHeaderState({
  connected,
  busy,
  saving,
  hasApplyDraft,
  applyValid,
  ramDirty,
  calibrationOwnsActions,
  hasUnsaved,
}) {
  if (!connected) {
    return {
      mode: "offline",
      label: hasUnsaved ? "Reconnect" : "Connect",
      action: HEADER_ACTION.CONNECT,
      disabled: busy,
      spinning: busy,
    };
  }
  if (saving) {
    return {
      mode: "saving",
      label: "Saving…",
      action: null,
      disabled: true,
      spinning: true,
    };
  }
  if (busy) {
    return {
      mode: "busy",
      label: "Working…",
      action: null,
      disabled: true,
      spinning: true,
    };
  }
  if (calibrationOwnsActions) {
    return {
      mode: "calibration",
      label: "Calibrating",
      action: null,
      disabled: true,
      spinning: false,
    };
  }
  if (hasApplyDraft) {
    return applyValid
      ? {
          mode: "draft",
          label: "Apply",
          action: HEADER_ACTION.APPLY,
          disabled: false,
          spinning: false,
        }
      : {
          mode: "invalid",
          label: "Fix errors",
          action: null,
          disabled: true,
          spinning: false,
        };
  }
  if (ramDirty) {
    return {
      mode: "applied",
      label: "Save",
      action: HEADER_ACTION.SAVE,
      disabled: false,
      spinning: false,
    };
  }
  return {
    mode: "saved",
    label: "Saved",
    action: null,
    disabled: true,
    spinning: false,
  };
}

/**
 * Classify unsaved state so every navigation surface uses the same guard.
 */
export function deriveLeaveGuardKind({
  hasApplyDraft,
  calibrationPending,
  ramDirty,
}) {
  if (hasApplyDraft) {
    return LEAVE_GUARD_KIND.DRAFT;
  }
  if (calibrationPending) {
    return LEAVE_GUARD_KIND.CALIBRATION;
  }
  if (ramDirty) {
    return LEAVE_GUARD_KIND.APPLIED;
  }
  return LEAVE_GUARD_KIND.NONE;
}

/**
 * Keep partial calibration work guarded without treating completed capture
 * counters as unsaved state after firmware save succeeds.
 */
export function deriveCalibrationGuardPending({
  wizardStep,
  workflowPending,
  centerCaptureActive,
  completedCenterReturns,
  calibrationChanged,
}) {
  if (calibrationChanged) return true;
  if (wizardStep === "complete") return false;
  return workflowPending
    || centerCaptureActive
    || completedCenterReturns > 0;
}

/**
 * Protect only actions that can replace the current Profile draft or reload it.
 */
export function shouldGuardNavigation({
  hasUnsaved,
  currentProfile,
  targetProfile = currentProfile,
  destructive = false,
}) {
  return hasUnsaved && (
    destructive
    || targetProfile !== currentProfile
  );
}

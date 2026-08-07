export const COMBO_CAPTURE_POLL_MS = 20;
export const COMBO_CAPTURE_STABLE_MS = 100;

export function sourceIdsFromMask(mask) {
  return Array.from({ length: 26 }, (_, index) => index)
    .filter((source) => (mask >>> 0) & (1 << source));
}

function lowestSource(mask) {
  return sourceIdsFromMask(mask)[0] ?? 0;
}

export function createComboCaptureTracker(existingLeader = null) {
  return {
    phase: "waiting-neutral",
    previousMask: 0,
    stableMask: 0,
    stableSince: 0,
    leader: null,
    existingLeader,
  };
}

export function advanceComboCapture(tracker, inputMask, now) {
  const mask = inputMask & 0x03ffffff;

  if (tracker.phase === "waiting-neutral") {
    if (mask === 0) {
      tracker.phase = "capturing";
      tracker.previousMask = 0;
    }
    return { phase: tracker.phase, complete: false, mask, leader: tracker.leader };
  }

  const rising = mask & ~tracker.previousMask;
  if (mask === 0) {
    tracker.leader = null;
    tracker.stableMask = 0;
    tracker.stableSince = 0;
  } else if (tracker.leader === null && rising) {
    tracker.leader = tracker.existingLeader != null
      && (rising & (1 << tracker.existingLeader))
      ? tracker.existingLeader
      : lowestSource(rising);
  }

  if (sourceIdsFromMask(mask).length >= 2) {
    if (mask !== tracker.stableMask) {
      tracker.stableMask = mask;
      tracker.stableSince = now;
    } else if ((now - tracker.stableSince) >= COMBO_CAPTURE_STABLE_MS) {
      tracker.previousMask = mask;
      return {
        phase: tracker.phase,
        complete: true,
        mask,
        leader: tracker.leader !== null && (mask & (1 << tracker.leader))
          ? tracker.leader
          : tracker.existingLeader != null && (mask & (1 << tracker.existingLeader))
            ? tracker.existingLeader
            : lowestSource(mask),
      };
    }
  } else {
    tracker.stableMask = 0;
    tracker.stableSince = 0;
  }

  tracker.previousMask = mask;
  return { phase: tracker.phase, complete: false, mask, leader: tracker.leader };
}

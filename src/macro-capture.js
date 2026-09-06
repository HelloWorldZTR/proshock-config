export const MACRO_CAPTURE_FULL = "Recording stopped at the shared step limit. The sequence was truncated.";

/** @brief Start a bounded snapshot timeline, optionally waiting for the first press. */
export function createMacroCapture({ limit, startMode, mask, now }) {
  return {
    limit, steps: [], mask, startedAt: now, segmentAt: now, elapsedMs: 0,
    waiting: startMode === "first-input" && mask === 0,
    active: limit > 0,
    notice: limit > 0 ? "" : MACRO_CAPTURE_FULL,
  };
}

/** @brief Count ticks that can still represent the current constant input segment. */
function availableTicks(capture) {
  const last = capture.steps.at(-1);
  return (capture.limit - capture.steps.length) * 255
    + (last?.output_mask === capture.mask ? 255 - last.duration_4ms : 0);
}

/** @brief Append a bounded segment, coalescing equal outputs and splitting long holds. */
function appendSegment(capture, ticks) {
  while (ticks > 0) {
    const last = capture.steps.at(-1);
    if (last?.output_mask === capture.mask && last.duration_4ms < 255) {
      const add = Math.min(ticks, 255 - last.duration_4ms);
      last.duration_4ms += add;
      ticks -= add;
    } else {
      if (capture.steps.length >= capture.limit) return;
      const add = Math.min(ticks, 255);
      capture.steps.push({ output_mask: capture.mask, duration_4ms: add });
      ticks -= add;
    }
  }
}

/** @brief Advance on input changes or timer ticks; stop at capacity even during a hold. */
export function advanceMacroCapture(capture, mask, now, { stop = false } = {}) {
  if (!capture.active) return capture;
  if (capture.waiting) {
    if (stop) { capture.active = false; capture.waiting = false; return capture; }
    if (mask === 0) return capture;
    capture.waiting = false;
    capture.startedAt = now;
    capture.segmentAt = now;
    capture.mask = mask;
  }
  capture.elapsedMs = Math.max(0, now - capture.startedAt);
  const duration = Math.max(0, now - capture.segmentAt);
  const capacity = availableTicks(capture);
  const ticks = Math.max(1, Math.round(duration / 4));

  // Check remaining storage on timer ticks as well as edges, so a long hold ends.
  if (duration >= capacity * 4 || ((stop || mask !== capture.mask) && ticks > capacity)) {
    appendSegment(capture, capacity);
    capture.active = false;
    capture.notice = MACRO_CAPTURE_FULL;
  } else if (stop || mask !== capture.mask) {
    appendSegment(capture, ticks);
    capture.segmentAt = now;
    capture.mask = mask;
    capture.active = !stop;
    if (!stop && availableTicks(capture) === 0) {
      capture.active = false;
      capture.notice = MACRO_CAPTURE_FULL;
    }
  }
  return capture;
}

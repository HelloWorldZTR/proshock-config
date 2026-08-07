import {
  ADC_MAX,
  ANALOG_CALIBRATION_VERSION,
  AXES,
  CURVE_TYPE_PIECEWISE_LINEAR,
  Q15_ONE,
  ROUNDNESS_Q15_ONE,
  ROUNDNESS_SECTOR_COUNT,
} from "./protocol.js";
import { cloneConfigData } from "./clone-data.js";

export const CENTER_SAMPLE_COUNT = 64;
export const CENTER_RETURN_SAMPLE_COUNT = 16;
export const CENTER_NOISE_MAX_COUNTS = 32;
export const CENTER_NOISE_MAX_RATIO = 0.02;
export const CENTER_GESTURE_MIN_COUNTS = 768;
export const CENTER_RELEASE_MAX_COUNTS = 128;
export const CENTER_RELEASE_STABLE_SAMPLES = 5;
export const RANGE_SAMPLE_LIMIT = 1024;
export const RIM_MIN_RADIUS = 0.85;
export const SECTOR_MIN_SAMPLES = 8;
export const STICK_MIN_SIDE_SPAN = 512;
export const RAW_POLL_MS = 20;
export const TRIGGER_ENDPOINT_MARGIN_RATIO = 0.02;
export const WIZARD_STEPS = [
  "backup",
  "neutral",
  "sticks-range",
  "triggers-released",
  "triggers-pressed",
  "validate-calibration",
  "save",
  "complete",
];

export const CENTER_RETURN_DIRECTIONS = Object.freeze([
  Object.freeze({ id: "top-left", label: "Top left", xSign: -1, ySign: 1 }),
  Object.freeze({ id: "bottom-right", label: "Bottom right", xSign: 1, ySign: -1 }),
  Object.freeze({ id: "top-right", label: "Top right", xSign: 1, ySign: 1 }),
  Object.freeze({ id: "bottom-left", label: "Bottom left", xSign: -1, ySign: -1 }),
]);

export const CURVE_PRESETS = {
  linear: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  centerPrecise: [0, 0.06, 0.15, 0.27, 0.42, 0.58, 0.74, 0.88, 1],
  centerAggressive: [0, 0.20, 0.36, 0.50, 0.62, 0.73, 0.83, 0.92, 1],
  earlyFull: [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1, 1, 1],
};

export function clampRaw(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(ADC_MAX, Math.round(numeric)));
}

export function percentile(values, percentileValue) {
  if (!values.length) {
    throw new Error("Cannot calculate a percentile from an empty sample set.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function median(values) {
  return percentile(values, 0.5);
}

export function dedupeSnapshots(snapshots) {
  const seen = new Set();
  return snapshots.filter((snapshot) => {
    if (!snapshot || seen.has(snapshot.sequence)) {
      return false;
    }
    seen.add(snapshot.sequence);
    return true;
  });
}

function fixedWindowEndpoint(values, highest) {
  const sorted = [...values].sort((left, right) => left - right);
  const windowSize = Math.min(SECTOR_MIN_SAMPLES, sorted.length);
  const selected = highest
    ? sorted.slice(sorted.length - windowSize)
    : sorted.slice(0, windowSize);
  return Math.round(median(selected));
}

function addTriggerEndpointMargins(measuredReleased, measuredPressed) {
  const measuredSpan = measuredPressed - measuredReleased;
  if (measuredSpan < 3) {
    return {
      rawReleased: measuredReleased,
      rawPressed: measuredPressed,
    };
  }

  // Pull both calibrated endpoints inward so release noise stays at zero and
  // the physical stop reaches full scale without requiring extra force.
  const margin = Math.min(
    Math.floor((measuredSpan - 1) / 2),
    Math.max(1, Math.round(measuredSpan * TRIGGER_ENDPOINT_MARGIN_RATIO)),
  );
  return {
    rawReleased: measuredReleased + margin,
    rawPressed: measuredPressed - margin,
  };
}

function selectTriggerPeakWindow(samples, releasedBaseline) {
  const maxima = [0, 1].map((triggerIndex) => Math.max(
    ...samples.map((sample) => sample.adc[4 + triggerIndex]),
  ));
  const amplitudes = maxima.map((value, index) =>
    Math.max(1, value - releasedBaseline[index]));
  const scored = samples.map((sample) => ({
    sample,
    score: Math.min(
      (sample.adc[4] - releasedBaseline[0]) / amplitudes[0],
      (sample.adc[5] - releasedBaseline[1]) / amplitudes[1],
    ),
  }));
  const peakSamples = scored.filter(({ score }) => score >= 0.75);
  return (peakSamples.length ? peakSamples : scored)
    .sort((left, right) => {
      return right.score - left.score;
    })
    .slice(0, 12)
    .map(({ sample }) => sample);
}

export function createTriggerCycleCapture(releasedSnapshots) {
  const released = dedupeSnapshots(releasedSnapshots);
  if (!released.length) {
    throw new Error("Trigger cycle capture requires a released baseline.");
  }
  const releasedBaseline = [0, 1].map((triggerIndex) => Math.round(median(
    released.map((sample) => sample.adc[4 + triggerIndex]),
  )));
  const releasedNoise = [0, 1].map((triggerIndex) => {
    const values = released.map((sample) => sample.adc[4 + triggerIndex]);
    return Math.max(...values) - Math.min(...values);
  });
  return {
    state: "released",
    cycleSamples: [],
    pressWindows: [],
    releasedBaseline,
    pressThreshold: releasedNoise.map((noise) => Math.max(2, noise + 2)),
    releaseThreshold: releasedNoise,
  };
}

export function recordTriggerCycleSample(capture, raw) {
  const deltas = [0, 1].map((triggerIndex) =>
    raw.adc[4 + triggerIndex] - capture.releasedBaseline[triggerIndex]);
  if (capture.state === "released") {
    if (deltas.every((value, index) => value >= capture.pressThreshold[index])) {
      capture.state = "pressed";
      capture.cycleSamples = [raw];
    }
    return false;
  }

  if (deltas.every((value, index) => value <= capture.releaseThreshold[index])) {
    capture.pressWindows.push(
      selectTriggerPeakWindow(capture.cycleSamples, capture.releasedBaseline),
    );
    capture.state = "released";
    capture.cycleSamples = [];
    return true;
  }

  capture.cycleSamples.push(raw);
  if (capture.cycleSamples.length > 256) {
    capture.cycleSamples = capture.cycleSamples.slice(-256);
  }
  return false;
}

export function analyzeNeutral(snapshots) {
  const unique = dedupeSnapshots(snapshots);
  if (unique.length < CENTER_SAMPLE_COUNT) {
    throw new Error(`Neutral requires ${CENTER_SAMPLE_COUNT} unique samples.`);
  }
  const selected = unique.slice(-CENTER_SAMPLE_COUNT);
  const axes = AXES.map((name, index) => {
    const values = selected.map((sample) => sample.adc[index]);
    const p05 = percentile(values, 0.05);
    const p95 = percentile(values, 0.95);
    const noiseSpan = p95 - p05;
    return {
      name,
      center: Math.round(median(values)),
      p05,
      p95,
      noiseSpan,
      pass: noiseSpan <= CENTER_NOISE_MAX_COUNTS,
    };
  });
  const failed = axes.filter((axis) => !axis.pass);
  if (failed.length) {
    throw new Error(
      `Neutral unstable: ${failed.map((axis) => `${axis.name} span ${axis.noiseSpan.toFixed(1)}`).join(", ")}.`,
    );
  }
  return { axes, sampleCount: selected.length };
}

/**
 * Combine four direction-dependent return windows into the final stick center.
 */
export function analyzeCenterReturns(returnWindows) {
  if (returnWindows.length !== CENTER_RETURN_DIRECTIONS.length) {
    throw new Error(`Center capture requires ${CENTER_RETURN_DIRECTIONS.length} return windows.`);
  }
  const returns = returnWindows.map((windowSamples, directionIndex) => {
    const unique = dedupeSnapshots(windowSamples);
    if (unique.length < CENTER_RETURN_SAMPLE_COUNT) {
      throw new Error(
        `${CENTER_RETURN_DIRECTIONS[directionIndex].label} return requires ${CENTER_RETURN_SAMPLE_COUNT} unique samples.`,
      );
    }
    const selected = unique.slice(-CENTER_RETURN_SAMPLE_COUNT);
    return {
      direction: CENTER_RETURN_DIRECTIONS[directionIndex].id,
      axes: AXES.map((name, axisIndex) => {
        const values = selected.map((sample) => sample.adc[axisIndex]);
        return {
          name,
          center: Math.round(median(values)),
          noiseSpan: percentile(values, 0.95) - percentile(values, 0.05),
        };
      }),
      samples: selected,
    };
  });
  const axes = AXES.map((name, axisIndex) => {
    const values = returns.flatMap((entry) => (
      entry.samples.map((sample) => sample.adc[axisIndex])
    ));
    const returnCenters = returns.map((entry) => entry.axes[axisIndex].center);
    const p05 = percentile(values, 0.05);
    const p95 = percentile(values, 0.95);
    const noiseSpan = p95 - p05;
    return {
      name,
      center: Math.round(median(returnCenters)),
      returnCenters,
      p05,
      p95,
      noiseSpan,
      pass: noiseSpan <= CENTER_NOISE_MAX_COUNTS,
    };
  });
  const failed = axes.filter((axis) => !axis.pass);
  if (failed.length) {
    throw new Error(
      `Center return unstable: ${failed.map((axis) => `${axis.name} span ${axis.noiseSpan.toFixed(1)}`).join(", ")}.`,
    );
  }
  return {
    axes,
    returns: returns.map(({ direction, axes: returnAxes }) => ({
      direction,
      centers: returnAxes.map((axis) => axis.center),
    })),
    sampleCount: returns.length * CENTER_RETURN_SAMPLE_COUNT,
  };
}

/**
 * Create the automatic four-corner return-to-center capture tracker.
 */
export function createCenterReturnCapture(baselineSnapshots) {
  const unique = dedupeSnapshots(baselineSnapshots);
  if (unique.length < CENTER_RETURN_SAMPLE_COUNT) {
    throw new Error(`Center baseline requires ${CENTER_RETURN_SAMPLE_COUNT} unique samples.`);
  }
  const selected = unique.slice(-CENTER_RETURN_SAMPLE_COUNT);
  return {
    baseline: AXES.map((_, axisIndex) => (
      Math.round(median(selected.map((sample) => sample.adc[axisIndex])))
    )),
    directionIndex: 0,
    phase: "waiting-deflection",
    deflectedMask: 0,
    releaseStableSamples: 0,
    captureSamples: [],
    returnWindows: [],
    lastSequence: null,
  };
}

/**
 * Advance center capture by one raw ADC snapshot; return true when complete.
 */
export function recordCenterReturnSample(capture, sample) {
  if (!capture || !sample || capture.lastSequence === sample.sequence) {
    return false;
  }
  capture.lastSequence = sample.sequence;
  const direction = CENTER_RETURN_DIRECTIONS[capture.directionIndex];
  if (!direction) {
    return true;
  }

  if (capture.phase === "waiting-deflection") {
    for (let stickIndex = 0; stickIndex < 2; stickIndex += 1) {
      const xIndex = stickIndex * 2;
      const yIndex = xIndex + 1;
      const xDisplacement = (
        sample.adc[xIndex] - capture.baseline[xIndex]
      ) * direction.xSign;
      const yDisplacement = (
        sample.adc[yIndex] - capture.baseline[yIndex]
      ) * direction.ySign;
      if (
        xDisplacement >= CENTER_GESTURE_MIN_COUNTS
        && yDisplacement >= CENTER_GESTURE_MIN_COUNTS
      ) {
        capture.deflectedMask |= 1 << stickIndex;
      }
    }
    if (capture.deflectedMask === 0x03) {
      capture.phase = "waiting-release";
      capture.releaseStableSamples = 0;
    }
    return false;
  }

  const released = AXES.every((_, axisIndex) => (
    Math.abs(sample.adc[axisIndex] - capture.baseline[axisIndex])
      <= CENTER_RELEASE_MAX_COUNTS
  ));
  if (!released) {
    capture.releaseStableSamples = 0;
    capture.captureSamples = [];
    return false;
  }

  if (capture.phase === "waiting-release") {
    capture.releaseStableSamples += 1;
    if (capture.releaseStableSamples >= CENTER_RELEASE_STABLE_SAMPLES) {
      capture.phase = "sampling";
      capture.captureSamples = [];
    }
    return false;
  }

  capture.captureSamples.push(sample);
  if (capture.captureSamples.length < CENTER_RETURN_SAMPLE_COUNT) {
    return false;
  }
  capture.returnWindows.push(capture.captureSamples.slice(-CENTER_RETURN_SAMPLE_COUNT));
  capture.directionIndex += 1;
  capture.phase = "waiting-deflection";
  capture.deflectedMask = 0;
  capture.releaseStableSamples = 0;
  capture.captureSamples = [];
  return capture.directionIndex >= CENTER_RETURN_DIRECTIONS.length;
}

export function normalizeAxis(raw, calibration, axisIndex) {
  let normalized;
  if (raw < calibration.raw_center) {
    normalized = -(calibration.raw_center - raw)
      / (calibration.raw_center - calibration.raw_min);
  } else {
    normalized = (raw - calibration.raw_center)
      / (calibration.raw_max - calibration.raw_center);
  }
  normalized = Math.max(-1, Math.min(1, normalized));
  return axisIndex === 1 || axisIndex === 3 ? -normalized : normalized;
}

export function normalizedAxis(raw, calibration) {
  const axisIndex = AXES.indexOf(calibration?.name);
  return normalizeAxis(raw, calibration, axisIndex < 0 ? 0 : axisIndex);
}

export function normalizedTrigger(raw, calibration) {
  const span = calibration.raw_pressed - calibration.raw_released;
  if (span <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (raw - calibration.raw_released) / span));
}

export function analyzeStickRange(snapshots, stickIndex, neutralResult) {
  const unique = dedupeSnapshots(snapshots);
  if (unique.length > RANGE_SAMPLE_LIMIT) {
    throw new Error(`Range capture exceeded ${RANGE_SAMPLE_LIMIT} samples; retry the stick.`);
  }
  const xIndex = stickIndex * 2;
  const yIndex = xIndex + 1;
  const indexes = [xIndex, yIndex];
  const axis = indexes.map((axisIndex) => {
    const values = unique.map((sample) => sample.adc[axisIndex]);
    const rawMin = fixedWindowEndpoint(values, false);
    const rawMax = fixedWindowEndpoint(values, true);
    const rawCenter = neutralResult.axes[axisIndex].center;
    const shorterSpan = Math.min(rawCenter - rawMin, rawMax - rawCenter);
    if (shorterSpan < STICK_MIN_SIDE_SPAN) {
      throw new Error(
        `${AXES[axisIndex]} travel is below ${STICK_MIN_SIDE_SPAN} ADC counts on one side.`,
      );
    }
    const neutralNoise = neutralResult.axes[axisIndex].noiseSpan || 0;
    if (neutralNoise / shorterSpan > CENTER_NOISE_MAX_RATIO) {
      throw new Error(
        `${AXES[axisIndex]} neutral noise is ${(neutralNoise / shorterSpan * 100).toFixed(2)}% of its shorter calibrated span.`,
      );
    }
    return {
      name: AXES[axisIndex],
      raw_min: rawMin,
      raw_center: rawCenter,
      raw_max: rawMax,
      reserved: 0,
    };
  });

  const sectors = Array.from({ length: ROUNDNESS_SECTOR_COUNT }, () => []);
  unique.forEach((sample) => {
    const x = normalizeAxis(sample.adc[xIndex], axis[0], xIndex);
    const y = normalizeAxis(sample.adc[yIndex], axis[1], yIndex);
    const radius = Math.hypot(x, y);
    if (radius < RIM_MIN_RADIUS) {
      return;
    }
    const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(
      (angle + Math.PI / ROUNDNESS_SECTOR_COUNT)
      / (Math.PI * 2 / ROUNDNESS_SECTOR_COUNT),
    ) % ROUNDNESS_SECTOR_COUNT;
    sectors[sector].push(radius);
  });

  const missing = sectors
    .map((samples, index) => ({ index, count: samples.length }))
    .filter((sector) => sector.count < SECTOR_MIN_SAMPLES);
  if (missing.length) {
    throw new Error(
      `Missing rim coverage: ${missing.map((sector) => `${sector.index} (${sector.count}/8)`).join(", ")}.`,
    );
  }
  const radius_q15 = sectors.map((samples, sector) => {
    const outerSamples = [...samples]
      .sort((left, right) => right - left)
      .slice(0, SECTOR_MIN_SAMPLES);
    const radius = median(outerSamples);
    if (radius < RIM_MIN_RADIUS || radius > 1.5) {
      throw new Error(
        `Sector ${sector} boundary ${radius.toFixed(3)} is outside ${RIM_MIN_RADIUS.toFixed(2)}..1.50.`,
      );
    }
    return Math.round(radius * ROUNDNESS_Q15_ONE);
  });
  return {
    stickIndex,
    axis,
    radius_q15,
    sectorCounts: sectors.map((samples) => samples.length),
    sampleCount: unique.length,
  };
}

export function estimateStickCoverage(snapshots, stickIndex, neutralResult) {
  const counts = Array(ROUNDNESS_SECTOR_COUNT).fill(0);
  const unique = dedupeSnapshots(snapshots);
  if (unique.length < 8 || !neutralResult) {
    return counts;
  }
  const xIndex = stickIndex * 2;
  const yIndex = xIndex + 1;
  const calibration = [xIndex, yIndex].map((axisIndex) => {
    const values = unique.map((sample) => sample.adc[axisIndex]);
    const rawCenter = neutralResult.axes[axisIndex].center;
    return {
      name: AXES[axisIndex],
      raw_min: Math.min(rawCenter - 1, fixedWindowEndpoint(values, false)),
      raw_center: rawCenter,
      raw_max: Math.max(rawCenter + 1, fixedWindowEndpoint(values, true)),
    };
  });
  unique.forEach((sample) => {
    const x = normalizeAxis(sample.adc[xIndex], calibration[0], xIndex);
    const y = normalizeAxis(sample.adc[yIndex], calibration[1], yIndex);
    if (Math.hypot(x, y) < RIM_MIN_RADIUS) {
      return;
    }
    const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(
      (angle + Math.PI / ROUNDNESS_SECTOR_COUNT)
      / (Math.PI * 2 / ROUNDNESS_SECTOR_COUNT),
    ) % ROUNDNESS_SECTOR_COUNT;
    counts[sector] += 1;
  });
  return counts;
}

export function analyzeTriggers(releasedSnapshots, pressWindows) {
  const released = dedupeSnapshots(releasedSnapshots);
  if (released.length < CENTER_SAMPLE_COUNT) {
    throw new Error(`Trigger release requires ${CENTER_SAMPLE_COUNT} unique samples.`);
  }
  if (pressWindows.length !== 5 || pressWindows.some((window) => !window.length)) {
    throw new Error("Trigger calibration requires five stable full-press windows.");
  }

  return [0, 1].map((triggerIndex) => {
    const adcIndex = 4 + triggerIndex;
    const measuredReleased = Math.round(median(
      released.slice(-CENTER_SAMPLE_COUNT).map((sample) => sample.adc[adcIndex]),
    ));
    const pressMedians = pressWindows.map((window) => median(
      window.map((sample) => sample.adc[adcIndex]),
    ));
    const measuredPressed = Math.round(median(pressMedians));
    const dispersion = Math.max(...pressMedians) - Math.min(...pressMedians);
    if (measuredReleased >= measuredPressed) {
      throw new Error(`${triggerIndex ? "R2" : "L2"} direction is reversed.`);
    }
    if (dispersion > ADC_MAX * 0.03) {
      throw new Error(`${triggerIndex ? "R2" : "L2"} full-press dispersion exceeds 3%.`);
    }
    const { rawReleased, rawPressed } = addTriggerEndpointMargins(
      measuredReleased,
      measuredPressed,
    );
    return {
      name: triggerIndex ? "R2" : "L2",
      raw_released: rawReleased,
      raw_pressed: rawPressed,
      pressMedians,
      dispersion,
    };
  });
}

export function buildCalibrationDraft(base, neutral, leftRange, rightRange, triggers) {
  const draft = cloneConfigData(base);
  draft.calibration_version = ANALOG_CALIBRATION_VERSION;
  [...leftRange.axis, ...rightRange.axis].forEach((axis, index) => {
    draft.axis[index] = { ...axis };
  });
  draft.stick[0].radius_q15 = [...leftRange.radius_q15];
  draft.stick[1].radius_q15 = [...rightRange.radius_q15];
  draft.trigger = triggers.map((trigger) => ({
    name: trigger.name,
    raw_released: trigger.raw_released,
    raw_pressed: trigger.raw_pressed,
  }));
  neutral.axes.forEach((axis, index) => {
    draft.axis[index].raw_center = axis.center;
  });
  return draft;
}

export function validateCalibration(calibration) {
  const failures = [];
  calibration.axis.forEach((axis) => {
    if (!(axis.raw_min < axis.raw_center && axis.raw_center < axis.raw_max)) {
      failures.push(`${axis.name}: bounds must be min < center < max`);
    } else if (
      axis.raw_center - axis.raw_min < STICK_MIN_SIDE_SPAN
      || axis.raw_max - axis.raw_center < STICK_MIN_SIDE_SPAN
    ) {
      failures.push(`${axis.name}: one-side span is below ${STICK_MIN_SIDE_SPAN}`);
    }
  });
  calibration.stick.forEach((stick) => {
    stick.radius_q15.forEach((radius, sector) => {
      if (radius < 27853 || radius > 49151) {
        failures.push(`${stick.name}: sector ${sector} is outside Q1.15 0.85..1.50`);
      }
    });
  });
  calibration.trigger.forEach((trigger) => {
    if (trigger.raw_pressed <= trigger.raw_released) {
      failures.push(`${trigger.name}: released/pressed direction or span is invalid`);
    }
  });
  return { pass: failures.length === 0, failures };
}

export function curvePresetToQ15(name) {
  const preset = CURVE_PRESETS[name];
  if (!preset) {
    throw new Error(`Unknown curve preset: ${name}`);
  }
  return {
    type: CURVE_TYPE_PIECEWISE_LINEAR,
    flags: 0,
    output_q15: preset.map((value) => Math.round(value * Q15_ONE)),
  };
}

export function validateResponse(response) {
  const points = response.curve.output_q15;
  const validCurve = response.curve.type === CURVE_TYPE_PIECEWISE_LINEAR
    && response.curve.flags === 0
    && points.length === 9
    && points[0] === 0
    && points[8] === Q15_ONE
    && points.every((point, index) => (
      point >= 0
      && point <= Q15_ONE
      && (index === 0 || point >= points[index - 1])
    ));
  return validCurve
    && response.inner_deadzone_q15 >= 0
    && response.outer_deadzone_q15 >= 0
    && response.inner_deadzone_q15 + response.outer_deadzone_q15 < Q15_ONE;
}

export function nextWizardStep(current, direction = 1) {
  const index = WIZARD_STEPS.indexOf(current);
  if (index < 0) {
    throw new Error(`Unknown wizard step: ${current}`);
  }
  return WIZARD_STEPS[Math.max(0, Math.min(WIZARD_STEPS.length - 1, index + direction))];
}

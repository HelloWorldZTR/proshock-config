import {
  STICK_RC_ALPHA_MAX_Q15,
  STICK_RC_FLAG_BOOST,
  STICK_RC_FLAG_SMOOTHING,
  STICK_RC_GAIN_MAX_Q8_8,
} from "./protocol.js";

export const RC_SAMPLE_RATE_HZ = 8000;
export const RC_MIN_CUTOFF_HZ = 1;
export const RC_MAX_CUTOFF_HZ = RC_SAMPLE_RATE_HZ / 2;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function cutoffHzToAlpha(cutoffHz) {
  const frequency = clamp(Number(cutoffHz), RC_MIN_CUTOFF_HZ, RC_MAX_CUTOFF_HZ);
  const delta = 1 - Math.cos((2 * Math.PI * frequency) / RC_SAMPLE_RATE_HZ);
  return Math.sqrt(delta * delta + 2 * delta) - delta;
}

export function cutoffHzToAlphaQ15(cutoffHz) {
  return clamp(Math.round(cutoffHzToAlpha(cutoffHz) * 32768), 1, STICK_RC_ALPHA_MAX_Q15);
}

export function alphaQ15ToCutoffHz(alphaQ15) {
  const alpha = clamp(Number(alphaQ15) / 32768, 1 / 32768, 0.999999);
  const cosine = clamp(1 - (alpha * alpha) / (2 * (1 - alpha)), -1, 1);
  return (Math.acos(cosine) * RC_SAMPLE_RATE_HZ) / (2 * Math.PI);
}

export function validateStickRc(rc) {
  if (!rc) return false;
  const flags = Number(rc.flags);
  return Number.isInteger(flags)
    && (flags & ~0x03) === 0
    && Number.isInteger(rc.smoothing_alpha_q15)
    && rc.smoothing_alpha_q15 >= 1
    && rc.smoothing_alpha_q15 <= STICK_RC_ALPHA_MAX_Q15
    && Number.isInteger(rc.boost_fast_alpha_q15)
    && rc.boost_fast_alpha_q15 >= 1
    && rc.boost_fast_alpha_q15 <= STICK_RC_ALPHA_MAX_Q15
    && Number.isInteger(rc.boost_slow_alpha_q15)
    && rc.boost_slow_alpha_q15 >= 1
    && rc.boost_slow_alpha_q15 < rc.boost_fast_alpha_q15
    && Number.isInteger(rc.boost_gain_q8_8)
    && rc.boost_gain_q8_8 >= 0
    && rc.boost_gain_q8_8 <= STICK_RC_GAIN_MAX_Q8_8;
}

function emaResponse(alphaQ15, frequencyHz) {
  const alpha = Number(alphaQ15) / 32768;
  const remainder = 1 - alpha;
  const omega = (2 * Math.PI * frequencyHz) / RC_SAMPLE_RATE_HZ;
  const denominatorReal = 1 - remainder * Math.cos(omega);
  const denominatorImaginary = remainder * Math.sin(omega);
  const denominatorSquared = denominatorReal ** 2 + denominatorImaginary ** 2;
  return {
    real: (alpha * denominatorReal) / denominatorSquared,
    imaginary: (-alpha * denominatorImaginary) / denominatorSquared,
  };
}

function multiply(left, right) {
  return {
    real: left.real * right.real - left.imaginary * right.imaginary,
    imaginary: left.real * right.imaginary + left.imaginary * right.real,
  };
}

function magnitudeDb(value) {
  return 20 * Math.log10(Math.max(1e-9, Math.hypot(value.real, value.imaginary)));
}

export function stickRcResponseAt(rc, frequencyHz) {
  const smoothingEnabled = (rc.flags & STICK_RC_FLAG_SMOOTHING) !== 0;
  const boostEnabled = (rc.flags & STICK_RC_FLAG_BOOST) !== 0;
  const smoothing = smoothingEnabled
    ? emaResponse(rc.smoothing_alpha_q15, frequencyHz)
    : { real: 1, imaginary: 0 };
  let boost = { real: 1, imaginary: 0 };
  if (boostEnabled) {
    const fast = emaResponse(rc.boost_fast_alpha_q15, frequencyHz);
    const slow = emaResponse(rc.boost_slow_alpha_q15, frequencyHz);
    const gain = rc.boost_gain_q8_8 / 256;
    boost = {
      real: 1 + gain * (fast.real - slow.real),
      imaginary: gain * (fast.imaginary - slow.imaginary),
    };
  }
  return {
    smoothingDb: magnitudeDb(smoothing),
    boostDb: magnitudeDb(boost),
    finalDb: magnitudeDb(multiply(smoothing, boost)),
  };
}

export function logarithmicFrequencies(pointCount = 161) {
  const ratio = RC_MAX_CUTOFF_HZ / RC_MIN_CUTOFF_HZ;
  return Array.from(
    { length: pointCount },
    (_, index) => RC_MIN_CUTOFF_HZ * (ratio ** (index / (pointCount - 1))),
  );
}

export function stickRcFrequencySeries(
  stickConfigs,
  frequencies = logarithmicFrequencies(),
) {
  const stages = [
    ["Smoothing", "smoothingDb"],
    ["Boost", "boostDb"],
    ["Final", "finalDb"],
  ];
  return stickConfigs.flatMap((rc, stickIndex) => {
    const responses = frequencies.map((frequency) => ({
      frequency,
      ...stickRcResponseAt(rc, frequency),
    }));
    return stages.map(([stage, field]) => ({
      stickIndex,
      stage,
      points: responses.map((entry) => ({ x: entry.frequency, y: entry[field] })),
    }));
  });
}

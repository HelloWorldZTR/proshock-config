import { encodeMotion, validMotion } from './motion.js';

const SAMPLE_COUNT = 60;
const MOVED = 'Movement detected. Put the controller down and retry.';

/** @brief Estimate native MPU bias from still, already-compensated DS4 telemetry. */
export function estimateGyroBias(samples, config) {
  if (!validMotion(config) || samples.length < SAMPLE_COUNT) {
    throw new Error('Not enough fresh sensor readings. Retry calibration.');
  }
  const gyroSum = [0, 0, 0];
  const minimum = Array(6).fill(Infinity);
  const maximum = Array(6).fill(-Infinity);
  for (const sample of samples) {
    const axes = [...(sample.gyro || []), ...(sample.accel || [])];
    if (axes.length !== 6 || !axes.every(Number.isFinite)) {
      throw new Error('Sensor readings are invalid. Retry calibration.');
    }
    const gravity = Math.hypot(...sample.accel);
    if (gravity < 0.8 || gravity > 1.2 || sample.gyro.some(value => Math.abs(value) > 25)) {
      throw new Error(MOVED);
    }
    axes.forEach((value, axis) => {
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
      if (axis < 3) gyroSum[axis] += value;
      if (maximum[axis] - minimum[axis] > (axis < 3 ? 1.5 : 0.08)) throw new Error(MOVED);
    });
  }
  // Undo the fixed mount mapping (-X, -Z, -Y), then restore the applied bias.
  const bias = [0, 2, 1].map((ds4Axis, nativeAxis) => Math.round(
    config.gyro_bias[nativeAxis] - gyroSum[ds4Axis] / samples.length * 16.4,
  ));
  if (bias.some(value => value < -32768 || value > 32767)) {
    throw new Error('Calculated gyro offsets are out of range. Check the sensor.');
  }
  return bias;
}

/** @brief Read bounded snapshots without changing RAM, flash, or sensor filters. */
export async function captureGyroBias({ readSample, wait, now, cancelled, onProgress }) {
  const checkCancelled = () => {
    if (cancelled()) throw new Error('Gyro calibration cancelled.');
  };
  // Leave time to release the controller and let the existing filters settle.
  for (let remaining = 3; remaining > 0; remaining -= 1) {
    checkCancelled();
    onProgress({ phase: 'settling', remaining, progress: 0 });
    await wait(1000);
  }
  checkCancelled();
  const samples = [];
  let baseline;
  let lastSequence;
  const started = now();
  onProgress({ phase: 'sampling', progress: 0 });
  while (samples.length < SAMPLE_COUNT) {
    checkCancelled();
    if (now() - started > 8000) throw new Error('Not enough fresh sensor readings. Retry calibration.');
    const sample = await readSample();
    checkCancelled();
    if (sample.status !== 2 || !sample.config?.enabled || !validMotion(sample.config)) {
      throw new Error('Sensor is not streaming. Apply Motion sensor and retry.');
    }
    if (!baseline) baseline = sample;
    if (String(encodeMotion(sample.config)) !== String(encodeMotion(baseline.config))) {
      throw new Error('Motion settings changed. Retry calibration.');
    }
    if (sample.errors !== baseline.errors) throw new Error('Sensor communication failed. Retry calibration.');
    const sequenceDelta = lastSequence == null ? 1 : (sample.samples - lastSequence) >>> 0;
    if (sequenceDelta > 0x7fffffff) throw new Error('Sensor restarted. Retry calibration.');
    if (sequenceDelta) {
      samples.push(sample);
      lastSequence = sample.samples;
      onProgress({ phase: 'sampling', progress: Math.round(samples.length / SAMPLE_COUNT * 100) });
    }
    if (samples.length < SAMPLE_COUNT) await wait(50);
  }
  checkCancelled();
  // A stalled/backgrounded browser must not present a short burst as a full capture.
  if (now() - started > 8000) throw new Error('Not enough fresh sensor readings. Retry calibration.');
  return estimateGyroBias(samples, baseline.config);
}

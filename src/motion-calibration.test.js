import test from 'node:test';
import assert from 'node:assert/strict';
import { captureGyroBias, estimateGyroBias } from './motion-calibration.js';

const config = () => ({ version: 1, enabled: 1, dlpf: 3, gyro_cutoff_hz: 80, accel_cutoff_hz: 40, gyro_bias: [164, -328, 82] });
const sample = (sequence = 1) => ({ config: config(), status: 2, samples: sequence, errors: 0, gyro: [-1, 0.5, 2], accel: [0, 1, 0] });
/** @brief Simulate elapsed time and independent sensor samples without wall-clock delays. */
function captureOptions(overrides = {}) {
  let elapsed = 0;
  let sequence = 0;
  return {
    readSample: async () => sample(++sequence),
    wait: async ms => { elapsed += ms; },
    now: () => elapsed,
    cancelled: () => false,
    onProgress: () => {},
    ...overrides,
  };
}

test('stillness estimate undoes fixed mounting and adds the existing native bias once', () => {
  const samples = Array.from({ length: 60 }, () => sample());
  assert.deepEqual(estimateGyroBias(samples, config()), [180, -361, 74]);
  const calibrated = { ...config(), gyro_bias: [180, -361, 74] };
  assert.deepEqual(estimateGyroBias(samples.map(s => ({ ...s, gyro: [0, 0, 0] })), calibrated), calibrated.gyro_bias);
});

test('movement on either sensor and malformed readings never yield offsets', () => {
  for (const changed of [
    { gyro: [2, 0.5, 2] }, { accel: [0.1, 0.995, 0] },
    { accel: [0, 0, 0] }, { gyro: [26, 0, 0] }, { gyro: [NaN, 0, 0] },
  ]) {
    const samples = Array.from({ length: 60 }, () => sample());
    samples[30] = { ...samples[30], ...changed };
    assert.throws(() => estimateGyroBias(samples, config()));
  }
  assert.throws(() => estimateGyroBias([sample()], config()), /Not enough/);
  assert.throws(() => estimateGyroBias(Array.from({ length: 60 }, () => sample()), { ...config(), gyro_bias: [32767, 0, 0] }), /out of range/);
});

test('capture prepares for three seconds then collects 60 unique snapshots without writes', async () => {
  const phases = [];
  const options = captureOptions({ onProgress: state => phases.push(state) });
  assert.deepEqual(await captureGyroBias(options), [180, -361, 74]);
  assert.deepEqual(phases.slice(0, 3).map(s => s.remaining), [3, 2, 1]);
  assert.equal(phases.at(-1).progress, 100);
  assert.equal(options.now(), 5950);
});

test('duplicate snapshots are excluded and a stalled sensor times out', async () => {
  let reads = 0;
  await captureGyroBias(captureOptions({ readSample: async () => sample(Math.floor(reads++ / 2)) }));
  assert.equal(reads, 119);
  await assert.rejects(captureGyroBias(captureOptions({ readSample: async () => sample(42) })), /Not enough/);
});

test('capture handles counter wrap but rejects restart, error counters and changed configuration', async () => {
  let count = 0xfffffffe;
  await captureGyroBias(captureOptions({ readSample: async () => sample(count++ >>> 0) }));
  for (const change of [
    { samples: 0 }, { errors: 1 }, { status: 3 },
    { config: { ...config(), gyro_bias: [0, 0, 0] } },
  ]) {
    let reads = 0;
    await assert.rejects(captureGyroBias(captureOptions({
      readSample: async () => ++reads === 2 ? { ...sample(101), ...change } : sample(100),
    })));
  }
});

test('cancelling during preparation or in-flight read prevents a result', async () => {
  for (const cancelAtRead of [false, true]) {
    let stopped = false;
    let reads = 0;
    const options = captureOptions({
      cancelled: () => stopped,
      readSample: async () => { reads++; stopped = true; return sample(); },
    });
    const originalWait = options.wait;
    options.wait = async ms => { await originalWait(ms); if (!cancelAtRead) stopped = true; };
    await assert.rejects(captureGyroBias(options), /cancelled/);
    assert.equal(reads, cancelAtRead ? 1 : 0);
  }
});

test('transport rejection and a long browser suspension cannot produce a calibration', async () => {
  await assert.rejects(captureGyroBias(captureOptions({ readSample: async () => { throw new Error('Disconnected'); } })), /Disconnected/);
  const options = captureOptions();
  const wait = options.wait;
  options.wait = ms => wait(ms === 50 ? 10000 : ms);
  await assert.rejects(captureGyroBias(options), /Not enough/);
});

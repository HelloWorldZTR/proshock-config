/** MPU-6050 settings are gated by the firmware build, never the config schema. */
export const MOTION_MIN_BUILD = 2026100301;
export const MOTION_GET = 0x15;
export const MOTION_SET = 0x16;
export const MOTION_DLPF = [
  { value: 1, label: '184 Hz / 188 Hz' }, { value: 2, label: '94 Hz / 98 Hz' },
  { value: 3, label: '44 Hz / 42 Hz' }, { value: 4, label: '21 Hz / 20 Hz' },
  { value: 5, label: '10 Hz / 10 Hz' }, { value: 6, label: '5 Hz / 5 Hz' },
];
/** @brief Validate draft fields before sending a single fixed-size command. */
export function validMotion(config) {
  return !!config && config.version === 1 && [0, 1].includes(config.enabled)
    && MOTION_DLPF.some(item => item.value === config.dlpf)
    && [config.gyro_cutoff_hz, config.accel_cutoff_hz].every(value => Number.isInteger(value) && value >= 0 && value <= 250)
    && config.gyro_bias?.length === 3
    && config.gyro_bias.every(value => Number.isInteger(value) && value >= -32768 && value <= 32767);
}
/** @brief Preserve reserved bytes while replacing only supported fields. */
export function encodeMotion(config) {
  if (!validMotion(config)) throw new Error('Invalid motion settings.');
  const bytes = config.raw ? new Uint8Array(config.raw) : new Uint8Array(16);
  if (bytes.length !== 16) throw new Error('Unexpected motion config size.');
  const view = new DataView(bytes.buffer);
  bytes[0] = 1; bytes[1] = config.enabled; bytes[2] = config.dlpf; bytes[3] = 0;
  view.setUint16(4, config.gyro_cutoff_hz, true);
  view.setUint16(6, config.accel_cutoff_hz, true);
  config.gyro_bias.forEach((value, index) => view.setInt16(8 + index * 2, value, true));
  return bytes;
}
/** @brief Decode config plus status/counters/DS4-scaled motion (40 bytes). */
export function parseMotion(payload) {
  if (payload.byteLength !== 40) throw new Error('Unexpected motion response size.');
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const config = {
    version: payload[0], enabled: payload[1], dlpf: payload[2],
    gyro_cutoff_hz: view.getUint16(4, true), accel_cutoff_hz: view.getUint16(6, true),
    gyro_bias: [0, 1, 2].map(index => view.getInt16(8 + index * 2, true)),
    raw: Array.from(payload.subarray(0, 16)),
  };
  if (!validMotion(config) || payload[3] !== 0) throw new Error('Invalid motion settings.');
  return { config, status: payload[16], identity: payload[17],
    max_service_us: view.getUint16(18, true), samples: view.getUint32(20, true), errors: view.getUint32(24, true),
    gyro: [0, 1, 2].map(index => view.getInt16(28 + index * 2, true) / 16),
    accel: [0, 1, 2].map(index => view.getInt16(34 + index * 2, true) / 8192),
  };
}
/** @brief Compare encoded values so transport metadata cannot create a false draft. */
export function motionChanged(draft, baseline) {
  if (!draft || !baseline) return false;
  if (!validMotion(draft)) return true;
  return String(encodeMotion(draft)) !== String(encodeMotion(baseline));
}

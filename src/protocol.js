export const NORMAL_FILTERS = [{
  vendorId: 0x054c,
  productId: 0x09cc,
  usagePage: 0xfff0,
  usage: 0x40,
}];

export const CONFIG_FILTERS = [{
  vendorId: 0x054c,
  productId: 0x09cc,
  usagePage: 0xff00,
  usage: 0x01,
}];

export const FILTERS = [...NORMAL_FILTERS, ...CONFIG_FILTERS];

export const CONFIG_ENTRY_REPORT_ID = 0xf0;
export const CONFIG_ENTRY_PAYLOAD = new Uint8Array([
  0x50, 0x53, 0x34, 0x43, 0x46, 0x47, 0x01, 0x00,
]);

export const COMMAND = {
  GET_CONFIG: 0x01,
  SET_CONFIG: 0x02,
  SAVE_CONFIG: 0x03,
  GET_STATUS: 0x04,
  GET_RAW_INPUT: 0x05,
  GET_CONFIG_INFO: 0x06,
  GET_PROFILE_CHUNK: 0x07,
  BEGIN_PROFILE_WRITE: 0x08,
  SET_PROFILE_CHUNK: 0x09,
  COMMIT_PROFILE_WRITE: 0x0a,
  SWITCH_PROFILE: 0x0b,
  SET_GLOBAL_CONFIG: 0x0c,
  GET_ANALOG_CALIBRATION_CHUNK: 0x0d,
  BEGIN_ANALOG_CALIBRATION_WRITE: 0x0e,
  SET_ANALOG_CALIBRATION_CHUNK: 0x0f,
  COMMIT_ANALOG_CALIBRATION_WRITE: 0x10,
  GET_ANALOG_SNAPSHOT: 0x11,
  GET_DIGITAL_INPUT: 0x12,
  KEEP_ALIVE: 0x13,
  EXIT_CONFIG: 0x14,
};

export const STATUS_NAME = {
  0x00: "OK",
  0x01: "BUSY",
  0x02: "BAD_COMMAND",
  0x03: "BAD_LENGTH",
  0x04: "BAD_CONFIG",
  0x05: "SAVE_FAILED",
  0x06: "BAD_VERSION",
  0x07: "BAD_RANGE",
  0x08: "INCOMPLETE",
};

export const CONFIG_STATUS_NAME = {
  0: "OK",
  1: "FALLBACK_DEFAULT",
  2: "INVALID_SLOT",
  3: "FLASH_ERROR",
  4: "VERIFY_ERROR",
  5: "BAD_ARGUMENT",
};

export const AXES = ["LX", "LY", "RX", "RY"];
export const STICKS = ["Left stick", "Right stick"];
export const TRIGGERS = ["L2", "R2"];
export const PACKET_SIZE = 64;
export const HEADER_SIZE = 8;
export const PAYLOAD_SIZE = 56;
export const PROFILE_SIZE = 320;
export const PROFILE_CHUNK_DATA_SIZE = 48;
export const PROFILE_CHUNK_HEADER_SIZE = 8;
export const PROFILE_COUNT = 4;
export const ANALOG_CALIBRATION_SIZE = 116;
export const ANALOG_SNAPSHOT_SIZE = 52;
export const STATUS_SIZE = 16;
export const LEGACY_CONFIG_INFO_SIZE = 52;
export const CONFIG_INFO_SIZE = 56;
export const RAW_SIZE = 20;
export const DIGITAL_INPUT_SIZE = 8;
export const PROTOCOL_VERSION = 1;
export const SCHEMA_VERSION = 7;
export const PROFILE_VERSION = 4;
export const ANALOG_CALIBRATION_VERSION = 1;
export const CURVE_POINT_COUNT = 9;
export const CURVE_TYPE_PIECEWISE_LINEAR = 1;
export const ROUNDNESS_SECTOR_COUNT = 16;
export const Q15_ONE = 32767;
export const ROUNDNESS_Q15_ONE = 32768;
export const ADC_MAX = 4095;

const RESPONSE_SIZE = 24;
const STICK_RESPONSE_OFFSET = 8;
const TRIGGER_RESPONSE_OFFSET = 56;
const STICK_SHAPE_OFFSET = 256;

import {
  createDefaultResolver,
  parseResolver,
  writeResolver,
} from "./resolver-schema.js";
import {
  LEGACY_CALIBRATION_AXIS_INVERT,
  calibrationAxisInvertFromMask,
} from "./calibration-polarity.js";

export function encodePacket(command, payload = new Uint8Array()) {
  if (payload.byteLength > PAYLOAD_SIZE) {
    throw new Error(`Payload too large: ${payload.byteLength}`);
  }
  const packet = new Uint8Array(PACKET_SIZE);
  const view = new DataView(packet.buffer);
  packet[0] = PROTOCOL_VERSION;
  packet[1] = command;
  view.setUint16(4, payload.byteLength, true);
  packet.set(payload, HEADER_SIZE);
  return packet;
}

export function decodePacket(bytes) {
  if (bytes.byteLength !== PACKET_SIZE) {
    throw new Error(`Unexpected packet size: ${bytes.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadLength = view.getUint16(4, true);
  if (payloadLength > PAYLOAD_SIZE) {
    throw new Error(`Unexpected payload length: ${payloadLength}`);
  }
  return {
    protocolVersion: bytes[0],
    command: bytes[1],
    status: bytes[2],
    payloadLength,
    payload: bytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLength),
  };
}

function parseResponse(view, offset) {
  return {
    inner_deadzone_q15: view.getUint16(offset, true),
    outer_deadzone_q15: view.getUint16(offset + 2, true),
    curve: {
      type: view.getUint8(offset + 4),
      flags: view.getUint8(offset + 5),
      output_q15: Array.from(
        { length: CURVE_POINT_COUNT },
        (_, index) => view.getUint16(offset + 6 + index * 2, true),
      ),
    },
  };
}

function writeResponse(view, offset, response) {
  view.setUint16(offset, response.inner_deadzone_q15, true);
  view.setUint16(offset + 2, response.outer_deadzone_q15, true);
  view.setUint8(offset + 4, response.curve.type);
  view.setUint8(offset + 5, response.curve.flags);
  response.curve.output_q15.forEach((value, index) => {
    view.setUint16(offset + 6 + index * 2, value, true);
  });
}

export function createLinearResponse() {
  return {
    inner_deadzone_q15: 0,
    outer_deadzone_q15: 0,
    curve: {
      type: CURVE_TYPE_PIECEWISE_LINEAR,
      flags: 0,
      output_q15: Array.from(
        { length: CURVE_POINT_COUNT },
        (_, index) => index === 8 ? Q15_ONE : index * 4096,
      ),
    },
  };
}

export function parseProfile(payload, index = 0) {
  if (payload.byteLength !== PROFILE_SIZE) {
    throw new Error(`Unexpected profile payload size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    index,
    profile_version: view.getUint16(0, true),
    flags: view.getUint16(2, true),
    color_rgb: [payload[4], payload[5], payload[6]],
    reserved0: payload[7],
    stick_response: Array.from(
      { length: 2 },
      (_, responseIndex) => parseResponse(
        view,
        STICK_RESPONSE_OFFSET + responseIndex * RESPONSE_SIZE,
      ),
    ),
    trigger_response: Array.from(
      { length: 2 },
      (_, responseIndex) => parseResponse(
        view,
        TRIGGER_RESPONSE_OFFSET + responseIndex * RESPONSE_SIZE,
      ),
    ),
    resolver: parseResolver(payload),
    stick_shape: STICKS.map((name, stickIndex) => ({
      name,
      scale_q15: Array.from(
        { length: ROUNDNESS_SECTOR_COUNT },
        (_, sector) => view.getUint16(
          STICK_SHAPE_OFFSET + stickIndex * 32 + sector * 2,
          true,
        ),
      ),
    })),
    raw: new Uint8Array(payload),
  };
}

export function writeProfileDraftToPayload(payload, draft, resolverOptions = {}) {
  if (payload.byteLength !== PROFILE_SIZE) {
    throw new Error(`Unexpected profile payload size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  view.setUint16(0, PROFILE_VERSION, true);
  view.setUint16(2, draft.flags || 0, true);
  payload.set(draft.color_rgb.map((value) => Math.max(0, Math.min(255, value))), 4);
  draft.stick_response.forEach((response, index) => {
    writeResponse(view, STICK_RESPONSE_OFFSET + index * RESPONSE_SIZE, response);
  });
  draft.trigger_response.forEach((response, index) => {
    writeResponse(view, TRIGGER_RESPONSE_OFFSET + index * RESPONSE_SIZE, response);
  });
  writeResolver(
    payload,
    draft.resolver || createDefaultResolver(),
    undefined,
    resolverOptions,
  );
  STICKS.forEach((name, stickIndex) => {
    const values = draft.stick_shape?.[stickIndex]?.scale_q15
      || Array(ROUNDNESS_SECTOR_COUNT).fill(ROUNDNESS_Q15_ONE);
    values.forEach((value, sector) => {
      const numeric = Number(value);
      view.setUint16(
        STICK_SHAPE_OFFSET + stickIndex * 32 + sector * 2,
        Number.isFinite(numeric) ? Math.max(0, Math.min(0xffff, Math.round(numeric))) : ROUNDNESS_Q15_ONE,
        true,
      );
    });
  });
}

export function createDefaultAnalogCalibration() {
  return {
    calibration_version: ANALOG_CALIBRATION_VERSION,
    flags: 0,
    axis: AXES.map((name) => ({
      name,
      raw_min: 5,
      raw_center: 2048,
      raw_max: 4085,
      reserved: 0,
    })),
    stick: STICKS.map((name) => ({
      name,
      radius_q15: Array(ROUNDNESS_SECTOR_COUNT).fill(ROUNDNESS_Q15_ONE),
    })),
    trigger: TRIGGERS.map((name) => ({
      name,
      raw_released: 5,
      raw_pressed: 4085,
    })),
    raw: new Uint8Array(ANALOG_CALIBRATION_SIZE),
  };
}

export function parseAnalogCalibration(payload) {
  if (payload.byteLength !== ANALOG_CALIBRATION_SIZE) {
    throw new Error(`Unexpected analog calibration size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    calibration_version: view.getUint16(0, true),
    flags: view.getUint16(2, true),
    axis: AXES.map((name, index) => {
      const offset = 4 + index * 8;
      return {
        name,
        raw_min: view.getUint16(offset, true),
        raw_center: view.getUint16(offset + 2, true),
        raw_max: view.getUint16(offset + 4, true),
        reserved: view.getUint16(offset + 6, true),
      };
    }),
    stick: STICKS.map((name, index) => {
      const offset = 36 + index * 32;
      return {
        name,
        radius_q15: Array.from(
          { length: ROUNDNESS_SECTOR_COUNT },
          (_, sector) => view.getUint16(offset + sector * 2, true),
        ),
      };
    }),
    trigger: TRIGGERS.map((name, index) => {
      const offset = 100 + index * 4;
      return {
        name,
        raw_released: view.getUint16(offset, true),
        raw_pressed: view.getUint16(offset + 2, true),
      };
    }),
    raw: new Uint8Array(payload),
  };
}

export function writeAnalogCalibrationToPayload(payload, calibration) {
  if (payload.byteLength !== ANALOG_CALIBRATION_SIZE) {
    throw new Error(`Unexpected analog calibration size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  view.setUint16(0, ANALOG_CALIBRATION_VERSION, true);
  view.setUint16(2, calibration.flags || 0, true);
  calibration.axis.forEach((axis, index) => {
    const offset = 4 + index * 8;
    view.setUint16(offset, axis.raw_min, true);
    view.setUint16(offset + 2, axis.raw_center, true);
    view.setUint16(offset + 4, axis.raw_max, true);
    view.setUint16(offset + 6, axis.reserved || 0, true);
  });
  calibration.stick.forEach((stick, index) => {
    const offset = 36 + index * 32;
    stick.radius_q15.forEach((radius, sector) => {
      view.setUint16(offset + sector * 2, radius, true);
    });
  });
  calibration.trigger.forEach((trigger, index) => {
    const offset = 100 + index * 4;
    view.setUint16(offset, trigger.raw_released, true);
    view.setUint16(offset + 2, trigger.raw_pressed, true);
  });
}

export function parseConfigInfo(payload) {
  if (
    payload.byteLength !== LEGACY_CONFIG_INFO_SIZE
    && payload.byteLength !== CONFIG_INFO_SIZE
  ) {
    throw new Error(`Unexpected config info size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const axisInvert = payload.byteLength >= CONFIG_INFO_SIZE
    ? calibrationAxisInvertFromMask(payload[52])
    : [...LEGACY_CALIBRATION_AXIS_INVERT];
  return {
    schema_version: view.getUint16(0, true),
    profile_size: view.getUint16(2, true),
    profile_count: payload[4],
    active_profile: payload[5],
    boot_profile: payload[6],
    dirty: payload[7],
    save_requested: payload[8],
    save_active: payload[9],
    load_status: payload[10],
    save_status: payload[11],
    validation_status: payload[12],
    fallback_used: payload[13],
    active_slot: payload[14],
    migration_warning: payload[15],
    sequence: view.getUint32(16, true),
    pollrate_hz: view.getUint32(20, true),
    feature_flags: view.getUint32(24, true),
    axis_invert_mask: payload.byteLength >= CONFIG_INFO_SIZE ? payload[52] & 0x0f : null,
    axis_invert: axisInvert,
    profiles: Array.from({ length: PROFILE_COUNT }, (_, index) => {
      const offset = 28 + index * 6;
      return {
        index,
        flags: view.getUint16(offset, true),
        color_rgb: [payload[offset + 2], payload[offset + 3], payload[offset + 4]],
      };
    }),
  };
}

export function parseStatus(payload) {
  if (payload.byteLength !== STATUS_SIZE) {
    throw new Error(`Unexpected status payload size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    load_status: payload[0],
    save_status: payload[1],
    validation_status: payload[2],
    fallback_used: payload[3],
    dirty: payload[4],
    save_requested: payload[5],
    save_active: payload[6],
    active_slot: payload[7],
    active_profile: payload[8],
    boot_profile: payload[9],
    profile_count: payload[10],
    migration_warning: payload[11],
    sequence: view.getUint32(12, true),
  };
}

export function parseRawInput(payload) {
  if (payload.byteLength !== RAW_SIZE) {
    throw new Error(`Unexpected raw payload size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    sequence: view.getUint32(0, true),
    adc: Array.from({ length: 6 }, (_, index) => view.getUint16(4 + index * 2, true)),
    buttons: view.getUint16(16, true),
    dpad_hat: payload[18],
    adc_running: payload[19],
  };
}

export function digitalMaskFromRawInput(raw) {
  let mask = (raw?.buttons || 0) & 0x3fff;
  const hat = raw?.dpad_hat ?? 8;
  if ([0, 1, 7].includes(hat)) mask |= 1 << 14;
  if ([1, 2, 3].includes(hat)) mask |= 1 << 15;
  if ([3, 4, 5].includes(hat)) mask |= 1 << 16;
  if ([5, 6, 7].includes(hat)) mask |= 1 << 17;
  return mask >>> 0;
}

export function parseDigitalInput(payload) {
  if (payload.byteLength !== DIGITAL_INPUT_SIZE) {
    throw new Error(`Unexpected digital input payload size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    sequence: view.getUint32(0, true),
    digital_mask: view.getUint32(4, true) & 0x03ffffff,
  };
}

export function parseAnalogSnapshot(payload) {
  if (payload.byteLength !== ANALOG_SNAPSHOT_SIZE) {
    throw new Error(`Unexpected analog snapshot size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    sequence: view.getUint32(0, true),
    raw_adc: Array.from({ length: 6 }, (_, index) => view.getUint16(4 + index * 2, true)),
    calibrated_stick_q15: Array.from({ length: 4 }, (_, index) => view.getInt16(16 + index * 2, true)),
    calibrated_trigger_q15: Array.from({ length: 2 }, (_, index) => view.getUint16(24 + index * 2, true)),
    output_stick_q15: Array.from({ length: 4 }, (_, index) => view.getInt16(28 + index * 2, true)),
    output_trigger_q15: Array.from({ length: 2 }, (_, index) => view.getUint16(36 + index * 2, true)),
    hid: Array.from(payload.slice(40, 46)),
    adc_running: payload[46],
    validation_flags: payload[47],
    runtime_generation: view.getUint32(48, true),
  };
}

export function makeProfileChunkRequest(profileIndex, offset, length) {
  const payload = new Uint8Array(PROFILE_CHUNK_HEADER_SIZE);
  const view = new DataView(payload.buffer);
  payload[0] = profileIndex;
  view.setUint16(2, offset, true);
  view.setUint16(4, length, true);
  return payload;
}

export function makeProfileChunkWrite(profileIndex, offset, bytes) {
  const payload = new Uint8Array(PROFILE_CHUNK_HEADER_SIZE + bytes.byteLength);
  const view = new DataView(payload.buffer);
  payload[0] = profileIndex;
  view.setUint16(2, offset, true);
  view.setUint16(4, bytes.byteLength, true);
  payload.set(bytes, PROFILE_CHUNK_HEADER_SIZE);
  return payload;
}

export function parseProfileChunk(payload) {
  if (payload.byteLength < PROFILE_CHUNK_HEADER_SIZE) {
    throw new Error(`Unexpected chunk size: ${payload.byteLength}`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const length = view.getUint16(4, true);
  if (payload.byteLength !== PROFILE_CHUNK_HEADER_SIZE + length) {
    throw new Error(`Unexpected chunk data size: ${payload.byteLength}`);
  }
  return {
    profileIndex: payload[0],
    offset: view.getUint16(2, true),
    length,
    data: payload.slice(PROFILE_CHUNK_HEADER_SIZE),
  };
}

export function makeVersionPayload(version) {
  const payload = new Uint8Array(2);
  new DataView(payload.buffer).setUint16(0, version, true);
  return payload;
}

export function makeBeginProfilePayload(profileIndex) {
  const payload = new Uint8Array(3);
  payload[0] = profileIndex;
  new DataView(payload.buffer).setUint16(1, PROFILE_VERSION, true);
  return payload;
}

export function makeSwitchProfilePayload(profileIndex, setBoot = false) {
  return new Uint8Array([profileIndex, setBoot ? 1 : 0]);
}

export function makeGlobalConfigPayload(pollrateHz, bootProfile, featureFlags = 0) {
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setUint32(0, Number(pollrateHz), true);
  payload[4] = bootProfile;
  view.setUint32(8, Number(featureFlags), true);
  return payload;
}

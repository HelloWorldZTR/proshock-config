import {
  ANALOG_CALIBRATION_SIZE,
  PROFILE_SIZE,
  PROFILE_VERSION,
  SCHEMA_VERSION,
  parseProfile,
  writeProfileDraftToPayload,
} from "../protocol.js";
import { validateResponse } from "../calibration.js";
import { validateResolver } from "../resolver-schema.js";

export const PROFILE_FORMAT = "proshock4/profile";
export const BACKUP_FORMAT = "proshock4/device-backup";
export const EXPORT_VERSION = 1;

export function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function serialize(format, payload) {
  const payloadJson = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(payloadJson);
  return {
    format,
    export_version: EXPORT_VERSION,
    tool_version: "0.2.0",
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    payload,
    crc32: crc32(bytes).toString(16).padStart(8, "0"),
  };
}

export function exportProfile(profile) {
  const bytes = new Uint8Array(profile.raw);
  writeProfileDraftToPayload(bytes, profile);
  return serialize(PROFILE_FORMAT, {
    profile_version: profile.profile_version,
    profile_bytes: bytesToBase64(bytes),
  });
}

export function exportBackup(configInfo, profiles, calibration) {
  return serialize(BACKUP_FORMAT, {
    config: {
      pollrate_hz: configInfo.pollrate_hz,
      boot_profile: configInfo.boot_profile,
      feature_flags: configInfo.feature_flags,
    },
    profiles: profiles.map((profile) => exportProfile(profile).payload),
    calibration_version: calibration.calibration_version,
    calibration_bytes: bytesToBase64(calibration.raw),
  });
}

export function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("File is not a ProShock document.");
  if (![PROFILE_FORMAT, BACKUP_FORMAT].includes(envelope.format)) throw new Error("Unknown file format.");
  if (envelope.export_version > EXPORT_VERSION) throw new Error("This file was created by a newer tool version.");
  const actual = crc32(new TextEncoder().encode(JSON.stringify(envelope.payload))).toString(16).padStart(8, "0");
  if (actual !== envelope.crc32) throw new Error("File checksum does not match.");
  return envelope;
}

export function importProfile(envelope, targetIndex, baselineRaw = null) {
  validateEnvelope(envelope);
  if (envelope.format !== PROFILE_FORMAT) throw new Error("Choose a Profile file, not a full device backup.");
  const source = base64ToBytes(envelope.payload.profile_bytes);
  if (source.byteLength !== PROFILE_SIZE) throw new Error(`Profile must be ${PROFILE_SIZE} bytes.`);
  if (envelope.payload.profile_version !== PROFILE_VERSION) throw new Error("Profile version requires an explicit migration.");
  const imported = parseProfile(source, targetIndex);
  if (![...imported.stick_response, ...imported.trigger_response].every(validateResponse)) {
    throw new Error("Profile contains an invalid response curve.");
  }
  if (validateResolver(imported.resolver).length) {
    throw new Error("Profile contains an invalid Resolver configuration.");
  }
  if (baselineRaw) {
    const preserved = new Uint8Array(baselineRaw);
    const known = parseProfile(source, targetIndex);
    known.resolver.reserved = preserved.slice(244, 252);
    known.raw = preserved;
    writeProfileDraftToPayload(preserved, known, { allowReserved: true });
    return parseProfile(preserved, targetIndex);
  }
  return imported;
}

export function validateBackup(envelope) {
  validateEnvelope(envelope);
  if (envelope.format !== BACKUP_FORMAT) throw new Error("Choose a full device backup.");
  if (!Array.isArray(envelope.payload.profiles) || envelope.payload.profiles.length !== 4) {
    throw new Error("Backup must contain four Profiles.");
  }
  const calibration = base64ToBytes(envelope.payload.calibration_bytes);
  if (calibration.byteLength !== ANALOG_CALIBRATION_SIZE) throw new Error("Calibration payload length is invalid.");
  return envelope;
}

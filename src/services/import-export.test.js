import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  PROFILE_FORMAT,
  crc32,
  exportProfile,
  importProfile,
  validateBackup,
  validateEnvelope,
} from "./import-export.js";
import {
  ANALOG_CALIBRATION_SIZE,
  LEGACY_PROFILE_SIZE,
  LEGACY_PROFILE_VERSION,
  PROFILE_SIZE,
  PROFILE_VERSION,
  createLinearResponse,
  createDefaultStickRc,
  parseProfile,
  writeProfileDraftToPayload,
} from "../protocol.js";

globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

function fixtureProfile() {
  const raw = Uint8Array.from({ length: PROFILE_SIZE }, (_, index) => index & 0xff);
  const profile = {
    index: 0,
    profile_version: PROFILE_VERSION,
    flags: 3,
    color_rgb: [0x55, 0xd6, 0xff],
    pollrate_hz: 4000,
    stick_response: [createLinearResponse(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
    stick_rc: [createDefaultStickRc(), createDefaultStickRc()],
    raw,
  };
  writeProfileDraftToPayload(raw, profile);
  return parseProfile(raw, 0);
}

test("Profile export never contains physical calibration", () => {
  const envelope = exportProfile(fixtureProfile());
  assert.equal(envelope.format, PROFILE_FORMAT);
  assert.equal("calibration_bytes" in envelope.payload, false);
  assert.equal(envelope.payload.profile_version, PROFILE_VERSION);
  assert.doesNotThrow(() => validateEnvelope(envelope));
});

test("Profile import preserves reserved bytes from target slot", () => {
  const source = fixtureProfile();
  source.color_rgb = [1, 2, 3];
  source.stick_shape[0].scale_q15[4] = 45678;
  const envelope = exportProfile(source);
  const target = fixtureProfile();
  target.raw.fill(0xa5, 104);
  const imported = importProfile(envelope, 2, target.raw);
  assert.deepEqual(imported.color_rgb, [1, 2, 3]);
  assert.equal(imported.pollrate_hz, 4000);
  assert.equal(imported.raw[250], 0xa5);
  assert.equal(imported.stick_shape[0].scale_q15[4], 45678);
});

test("Future versions and corrupt documents are rejected", () => {
  const envelope = exportProfile(fixtureProfile());
  assert.throws(() => validateEnvelope({ ...envelope, export_version: 99 }), /newer/);
  assert.throws(() => validateEnvelope({ ...envelope, crc32: "00000000" }), /checksum/);
});

test("Profile v5 imports append disabled RC defaults", () => {
  const current = fixtureProfile();
  const legacyBytes = current.raw.slice(0, LEGACY_PROFILE_SIZE);
  new DataView(legacyBytes.buffer).setUint16(0, LEGACY_PROFILE_VERSION, true);
  const payload = {
    profile_version: LEGACY_PROFILE_VERSION,
    profile_bytes: Buffer.from(legacyBytes).toString("base64"),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const envelope = {
    format: PROFILE_FORMAT,
    export_version: 1,
    payload,
    crc32: crc32(bytes).toString(16).padStart(8, "0"),
  };
  const imported = importProfile(envelope, 1);
  assert.equal(imported.profile_version, PROFILE_VERSION);
  assert.equal(imported.raw.byteLength, PROFILE_SIZE);
  assert.deepEqual(imported.stick_rc.map((rc) => rc.flags), [0, 0]);
});

test("legacy full backups migrate all four Profile v5 payloads", () => {
  const legacyProfiles = Array.from({ length: 4 }, () => {
    const bytes = fixtureProfile().raw.slice(0, LEGACY_PROFILE_SIZE);
    new DataView(bytes.buffer).setUint16(0, LEGACY_PROFILE_VERSION, true);
    return {
      profile_version: LEGACY_PROFILE_VERSION,
      profile_bytes: Buffer.from(bytes).toString("base64"),
    };
  });
  const payload = {
    profiles: legacyProfiles,
    calibration_bytes: Buffer.alloc(ANALOG_CALIBRATION_SIZE).toString("base64"),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const migrated = validateBackup({
    format: BACKUP_FORMAT,
    export_version: 1,
    payload,
    crc32: crc32(bytes).toString(16).padStart(8, "0"),
  });
  assert.equal(migrated.profiles.length, 4);
  assert.ok(migrated.profiles.every((profile) => profile.profile_version === PROFILE_VERSION));
  assert.ok(migrated.profiles.every((profile) => profile.raw.byteLength === PROFILE_SIZE));
  assert.ok(migrated.profiles.every((profile) => profile.stick_rc.every((rc) => rc.flags === 0)));
});

test("Profile import rejects invalid RC ordering", () => {
  const profile = fixtureProfile();
  const bytes = new Uint8Array(profile.raw);
  const view = new DataView(bytes.buffer);
  view.setUint16(324, 1000, true);
  view.setUint16(326, 2000, true);
  const payload = {
    profile_version: PROFILE_VERSION,
    profile_bytes: Buffer.from(bytes).toString("base64"),
  };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const envelope = {
    format: PROFILE_FORMAT,
    export_version: 1,
    payload,
    crc32: crc32(encoded).toString(16).padStart(8, "0"),
  };
  assert.throws(() => importProfile(envelope, 0), /invalid RC/);
});

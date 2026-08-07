import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_FORMAT,
  exportProfile,
  importProfile,
  validateEnvelope,
} from "./import-export.js";
import {
  PROFILE_SIZE,
  PROFILE_VERSION,
  createLinearResponse,
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
    stick_response: [createLinearResponse(), createLinearResponse()],
    trigger_response: [createLinearResponse(), createLinearResponse()],
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
  assert.equal(imported.raw[250], 0xa5);
  assert.equal(imported.stick_shape[0].scale_q15[4], 45678);
});

test("Future versions and corrupt documents are rejected", () => {
  const envelope = exportProfile(fixtureProfile());
  assert.throws(() => validateEnvelope({ ...envelope, export_version: 99 }), /newer/);
  assert.throws(() => validateEnvelope({ ...envelope, crc32: "00000000" }), /checksum/);
});

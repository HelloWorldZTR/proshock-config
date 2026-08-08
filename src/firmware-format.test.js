import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
  webcrypto,
} from "node:crypto";
import {
  APP_BASE,
  MANIFEST_SIZE,
  buildUnsignedManifest,
  crc16Ccitt,
  crc32,
  encodeIntelHex,
  parseFirmwarePackage,
  parseIntelHex,
  parseVersion,
  publicKeyId,
  signatureMessage,
  verifyFirmwarePackage,
  xteaCtrCrypt,
} from "./firmware-format.js";

function rawPublicKey(publicKey) {
  return new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(12));
}

test("Intel HEX canonicalizes the relocated alias and fills holes", () => {
  const memory = new Map([
    [0x00008000, 0x13],
    [0x00008001, 0x00],
    [0x00008007, 0xaa],
  ]);
  const parsed = parseIntelHex(encodeIntelHex(memory));
  assert.equal(parsed.payload.byteLength, 8);
  assert.deepEqual([...parsed.payload], [0x13, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xaa]);
});

test("Intel HEX rejects bootloader and config records", () => {
  assert.throws(() => parseIntelHex(encodeIntelHex(new Map([[0x08000000, 1]]))), /outside/);
  assert.throws(() => parseIntelHex(encodeIntelHex(new Map([[0x0801e000, 1]]))), /outside/);
});

test("XTEA CTR is symmetric and supports random offsets", () => {
  const nonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const plaintext = Uint8Array.from({ length: 97 }, (_, index) => index ^ 0x5a);
  const ciphertext = xteaCtrCrypt(plaintext, nonce);
  assert.deepEqual(xteaCtrCrypt(ciphertext, nonce), plaintext);
  assert.deepEqual(
    xteaCtrCrypt(ciphertext.slice(17, 66), nonce, 17),
    plaintext.slice(17, 66),
  );
  assert.equal(crc16Ccitt(new Uint8Array([1, 2, 3])), 0xadad);
});

test("signed package verifies and rejects payload or signature tampering", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicRaw = rawPublicKey(publicKey);
  const plaintext = Uint8Array.from({ length: 64 }, (_, index) => index);
  const nonce = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]);
  const ciphertext = xteaCtrCrypt(plaintext, nonce);
  const unsigned = buildUnsignedManifest({
    payloadLength: plaintext.byteLength,
    versionCode: parseVersion("1.2.3"),
    keyId: publicKeyId(publicRaw),
    nonce,
    plaintextCrc32: crc32(plaintext),
    ciphertextCrc32: crc32(ciphertext),
    plaintextSha512: new Uint8Array(createHash("sha512").update(plaintext).digest()),
  });
  const signature = sign(null, signatureMessage(unsigned), privateKey);
  const packageBytes = new Uint8Array(MANIFEST_SIZE + ciphertext.byteLength);
  packageBytes.set(unsigned);
  packageBytes.set(signature, 128);
  packageBytes.set(ciphertext, MANIFEST_SIZE);

  const verified = await verifyFirmwarePackage(packageBytes, publicRaw, webcrypto.subtle);
  assert.deepEqual(verified.plaintext, plaintext);
  assert.equal(parseFirmwarePackage(packageBytes).manifest.appBase, APP_BASE);

  const badPayload = packageBytes.slice();
  badPayload[MANIFEST_SIZE + 1] ^= 1;
  await assert.rejects(() => verifyFirmwarePackage(badPayload, publicRaw, webcrypto.subtle), /CRC/);
  const badSignature = packageBytes.slice();
  badSignature[128] ^= 1;
  await assert.rejects(() => verifyFirmwarePackage(badSignature, publicRaw, webcrypto.subtle), /signature/);
});

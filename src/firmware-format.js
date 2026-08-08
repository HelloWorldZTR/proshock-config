const textEncoder = new TextEncoder();

export const FIRMWARE_MAGIC = new Uint8Array([0x50, 0x53, 0x34, 0x46, 0x57, 0x56, 0x31, 0x00]);
export const SIGNATURE_DOMAIN = textEncoder.encode("ProShock4-Firmware-Manifest-V1\0");
export const FORMAT_VERSION = 1;
export const MANIFEST_UNSIGNED_SIZE = 128;
export const MANIFEST_SIZE = 192;
export const SIGNATURE_SIZE = 64;
export const TRANSFER_CHUNK_SIZE = 32;
export const TARGET_BOARD_ID = 0x30524201;
export const APP_BASE = 0x08008000;
export const APP_END = 0x0801e000;
export const APP_CAPACITY = APP_END - APP_BASE;
export const METADATA_BASE = 0x08007000;
export const METADATA_COMMIT_OFFSET = MANIFEST_SIZE;
export const METADATA_COMMIT = 0x49504150;
export const CONFIG_A_BASE = 0x0801e000;
export const CONFIG_B_BASE = 0x0801f000;
export const FLAG_XTEA_CTR = 0x0001;
export const ENCRYPTION_XTEA_CTR = 1;
export const SIGNATURE_ED25519 = 1;

/* XTEA is distribution obfuscation only. Ed25519 provides authenticity. */
export const XTEA_KEY = new Uint8Array([
  0x50, 0x72, 0x6f, 0x53, 0x68, 0x6f, 0x63, 0x6b,
  0x34, 0x2d, 0x49, 0x41, 0x50, 0x2d, 0x56, 0x31,
]);

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes, seed = 0xffffffff) {
  let value = seed >>> 0;
  for (const byte of bytes) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function crc16Ccitt(bytes, seed = 0xffff) {
  let value = seed;
  for (const byte of bytes) {
    value ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 0x8000) ? ((value << 1) ^ 0x1021) : (value << 1);
      value &= 0xffff;
    }
  }
  return value;
}

function readU32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function writeU32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value >>> 0, true);
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function xteaEncryptBlock(counterLow, counterHigh, keyWords) {
  let left = counterLow >>> 0;
  let right = counterHigh >>> 0;
  let sum = 0;
  const delta = 0x9e3779b9;
  for (let round = 0; round < 32; round += 1) {
    left = (left + ((((right << 4) ^ (right >>> 5)) + right)
      ^ ((sum + keyWords[sum & 3]) >>> 0))) >>> 0;
    sum = (sum + delta) >>> 0;
    right = (right + ((((left << 4) ^ (left >>> 5)) + left)
      ^ ((sum + keyWords[(sum >>> 11) & 3]) >>> 0))) >>> 0;
  }
  return [left, right];
}

export function xteaCtrCrypt(input, nonce, offset = 0, key = XTEA_KEY) {
  if (nonce.byteLength !== 8 || key.byteLength !== 16) {
    throw new Error("XTEA requires an 8-byte nonce and 16-byte key.");
  }
  const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
  const nonceView = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  const keyWords = Array.from({ length: 4 }, (_, index) => keyView.getUint32(index * 4, true));
  const nonceLow = nonceView.getUint32(0, true);
  const nonceHigh = nonceView.getUint32(4, true);
  const output = new Uint8Array(input.byteLength);
  let streamBlock = -1;
  let streamBytes = null;

  for (let index = 0; index < input.byteLength; index += 1) {
    const absoluteOffset = offset + index;
    const block = Math.floor(absoluteOffset / 8);
    if (block !== streamBlock) {
      const blockLow = (nonceLow + (block >>> 0)) >>> 0;
      const carry = blockLow < nonceLow ? 1 : 0;
      const blockHigh = (nonceHigh + Math.floor(block / 0x100000000) + carry) >>> 0;
      const encrypted = xteaEncryptBlock(blockLow, blockHigh, keyWords);
      streamBytes = new Uint8Array(8);
      writeU32(streamBytes, 0, encrypted[0]);
      writeU32(streamBytes, 4, encrypted[1]);
      streamBlock = block;
    }
    output[index] = input[index] ^ streamBytes[absoluteOffset & 7];
  }
  return output;
}

function parseHexByte(value, context) {
  const parsed = Number.parseInt(value, 16);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid Intel HEX ${context}.`);
  return parsed;
}

export function normalizeApplicationAddress(address) {
  if (address >= 0x00008000 && address < 0x0001e000) {
    return address + 0x08000000;
  }
  return address;
}

export function parseIntelHex(text) {
  const memory = new Map();
  let upperAddress = 0;
  let eofSeen = false;
  const lines = text.replace(/\r/g, "").split("\n");

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line) return;
    if (!line.startsWith(":")) throw new Error(`Intel HEX line ${lineIndex + 1} is missing ':'.`);
    if ((line.length < 11) || ((line.length & 1) === 0)) {
      throw new Error(`Intel HEX line ${lineIndex + 1} has an invalid length.`);
    }
    const bytes = [];
    for (let cursor = 1; cursor < line.length; cursor += 2) {
      bytes.push(parseHexByte(line.slice(cursor, cursor + 2), `line ${lineIndex + 1}`));
    }
    const sum = bytes.reduce((total, byte) => (total + byte) & 0xff, 0);
    if (sum !== 0) throw new Error(`Intel HEX line ${lineIndex + 1} has a bad checksum.`);
    const length = bytes[0];
    if (bytes.length !== length + 5) throw new Error(`Intel HEX line ${lineIndex + 1} length mismatch.`);
    const address = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.slice(4, 4 + length);

    if (type === 0x00) {
      for (let index = 0; index < data.length; index += 1) {
        const canonical = normalizeApplicationAddress(upperAddress + address + index);
        if (canonical < APP_BASE || canonical >= APP_END) {
          throw new Error(`Intel HEX data at 0x${canonical.toString(16)} is outside the application partition.`);
        }
        if (memory.has(canonical) && memory.get(canonical) !== data[index]) {
          throw new Error(`Intel HEX contains conflicting data at 0x${canonical.toString(16)}.`);
        }
        memory.set(canonical, data[index]);
      }
    } else if (type === 0x01) {
      eofSeen = true;
    } else if (type === 0x02) {
      if (data.length !== 2) throw new Error("Invalid Intel HEX segment address record.");
      upperAddress = (((data[0] << 8) | data[1]) << 4) >>> 0;
    } else if (type === 0x04) {
      if (data.length !== 2) throw new Error("Invalid Intel HEX linear address record.");
      upperAddress = (((data[0] << 8) | data[1]) << 16) >>> 0;
    } else if (type !== 0x03 && type !== 0x05) {
      throw new Error(`Unsupported Intel HEX record type 0x${type.toString(16)}.`);
    }
  });

  if (!eofSeen) throw new Error("Intel HEX EOF record is missing.");
  if (!memory.has(APP_BASE)) throw new Error("Intel HEX does not start at the application base.");
  const highestAddress = Math.max(...memory.keys());
  const payloadLength = Math.ceil((highestAddress - APP_BASE + 1) / 4) * 4;
  if (payloadLength <= 0 || payloadLength > APP_CAPACITY) throw new Error("Application payload is too large.");
  const payload = new Uint8Array(payloadLength).fill(0xff);
  memory.forEach((byte, address) => { payload[address - APP_BASE] = byte; });
  return { memory, payload, payloadLength };
}

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error("Firmware version must use major.minor.patch.");
  const parts = match.slice(1).map(Number);
  if (parts[0] > 0xffff || parts[1] > 0xff || parts[2] > 0xff) {
    throw new Error("Firmware version component is out of range.");
  }
  return ((parts[0] << 16) | (parts[1] << 8) | parts[2]) >>> 0;
}

export function formatVersion(versionCode) {
  return `${versionCode >>> 16}.${(versionCode >>> 8) & 0xff}.${versionCode & 0xff}`;
}

export function manifestCrc(unsignedManifest) {
  const covered = new Uint8Array(124);
  covered.set(unsignedManifest.slice(0, 60), 0);
  covered.set(unsignedManifest.slice(64, 128), 60);
  return crc32(covered);
}

export function buildUnsignedManifest({
  payloadLength,
  versionCode,
  minimumIapVersion = 1,
  keyId,
  nonce,
  plaintextCrc32,
  ciphertextCrc32,
  plaintextSha512,
}) {
  if (payloadLength <= 0 || payloadLength > APP_CAPACITY || (payloadLength & 3)) {
    throw new Error("Manifest payload length is outside the application partition or unaligned.");
  }
  if (nonce.byteLength !== 8 || plaintextSha512.byteLength !== 64) {
    throw new Error("Manifest nonce or SHA-512 length is invalid.");
  }
  const manifest = new Uint8Array(MANIFEST_UNSIGNED_SIZE);
  const view = new DataView(manifest.buffer);
  manifest.set(FIRMWARE_MAGIC, 0);
  view.setUint16(8, FORMAT_VERSION, true);
  view.setUint16(10, MANIFEST_SIZE, true);
  view.setUint32(12, TARGET_BOARD_ID, true);
  view.setUint32(16, APP_BASE, true);
  view.setUint32(20, payloadLength, true);
  view.setUint32(24, versionCode, true);
  view.setUint16(28, minimumIapVersion, true);
  view.setUint16(30, FLAG_XTEA_CTR, true);
  view.setUint32(32, keyId, true);
  manifest.set(nonce, 36);
  view.setUint32(44, plaintextCrc32, true);
  view.setUint32(48, ciphertextCrc32, true);
  view.setUint16(52, TRANSFER_CHUNK_SIZE, true);
  view.setUint8(54, ENCRYPTION_XTEA_CTR);
  view.setUint8(55, SIGNATURE_ED25519);
  manifest.set(plaintextSha512, 64);
  view.setUint32(60, manifestCrc(manifest), true);
  return manifest;
}

export function signatureMessage(unsignedManifest) {
  const message = new Uint8Array(SIGNATURE_DOMAIN.byteLength + unsignedManifest.byteLength);
  message.set(SIGNATURE_DOMAIN, 0);
  message.set(unsignedManifest, SIGNATURE_DOMAIN.byteLength);
  return message;
}

export function parseManifest(manifestBytes) {
  if (manifestBytes.byteLength !== MANIFEST_SIZE) throw new Error("Unexpected firmware manifest size.");
  const unsigned = manifestBytes.slice(0, MANIFEST_UNSIGNED_SIZE);
  if (!equalBytes(unsigned.slice(0, 8), FIRMWARE_MAGIC)) throw new Error("Firmware manifest magic is invalid.");
  const view = new DataView(unsigned.buffer, unsigned.byteOffset, unsigned.byteLength);
  const parsed = {
    formatVersion: view.getUint16(8, true),
    manifestSize: view.getUint16(10, true),
    targetBoardId: view.getUint32(12, true),
    appBase: view.getUint32(16, true),
    payloadLength: view.getUint32(20, true),
    versionCode: view.getUint32(24, true),
    minimumIapVersion: view.getUint16(28, true),
    flags: view.getUint16(30, true),
    keyId: view.getUint32(32, true),
    nonce: unsigned.slice(36, 44),
    plaintextCrc32: view.getUint32(44, true),
    ciphertextCrc32: view.getUint32(48, true),
    chunkSize: view.getUint16(52, true),
    encryptionAlgorithm: view.getUint8(54),
    signatureAlgorithm: view.getUint8(55),
    manifestCrc32: view.getUint32(60, true),
    plaintextSha512: unsigned.slice(64, 128),
    signature: manifestBytes.slice(128, 192),
    unsigned,
  };
  if (parsed.formatVersion !== FORMAT_VERSION || parsed.manifestSize !== MANIFEST_SIZE) {
    throw new Error("Unsupported firmware manifest version.");
  }
  if (parsed.targetBoardId !== TARGET_BOARD_ID || parsed.appBase !== APP_BASE) {
    throw new Error("Firmware targets a different board or application partition.");
  }
  if (parsed.payloadLength <= 0 || parsed.payloadLength > APP_CAPACITY || (parsed.payloadLength & 3)) {
    throw new Error("Firmware payload range is invalid.");
  }
  if (parsed.chunkSize !== TRANSFER_CHUNK_SIZE
      || parsed.encryptionAlgorithm !== ENCRYPTION_XTEA_CTR
      || parsed.signatureAlgorithm !== SIGNATURE_ED25519) {
    throw new Error("Firmware algorithms are not supported.");
  }
  if (manifestCrc(unsigned) !== parsed.manifestCrc32) throw new Error("Firmware manifest CRC is invalid.");
  return parsed;
}

export function parseFirmwarePackage(bytes) {
  if (bytes.byteLength < MANIFEST_SIZE) throw new Error("Firmware package is truncated.");
  const manifestBytes = bytes.slice(0, MANIFEST_SIZE);
  const manifest = parseManifest(manifestBytes);
  const ciphertext = bytes.slice(MANIFEST_SIZE);
  if (ciphertext.byteLength !== manifest.payloadLength) throw new Error("Firmware payload length does not match its manifest.");
  if (crc32(ciphertext) !== manifest.ciphertextCrc32) throw new Error("Firmware ciphertext CRC is invalid.");
  return { manifest, manifestBytes, ciphertext };
}

export async function verifyFirmwarePackage(bytes, publicKeyRaw, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("Web Crypto is unavailable.");
  const parsed = parseFirmwarePackage(bytes);
  const key = await subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, ["verify"]);
  const verified = await subtle.verify(
    { name: "Ed25519" },
    key,
    parsed.manifest.signature,
    signatureMessage(parsed.manifest.unsigned),
  );
  if (!verified) throw new Error("Firmware signature is invalid.");
  const plaintext = xteaCtrCrypt(parsed.ciphertext, parsed.manifest.nonce);
  if (crc32(plaintext) !== parsed.manifest.plaintextCrc32) throw new Error("Firmware plaintext CRC is invalid.");
  const digest = new Uint8Array(await subtle.digest("SHA-512", plaintext));
  if (!equalBytes(digest, parsed.manifest.plaintextSha512)) throw new Error("Firmware SHA-512 is invalid.");
  return { ...parsed, plaintext };
}

function hexRecord(address, type, data) {
  const bytes = [data.byteLength, (address >>> 8) & 0xff, address & 0xff, type, ...data];
  const checksum = (-bytes.reduce((sum, value) => sum + value, 0)) & 0xff;
  return `:${[...bytes, checksum].map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

export function encodeIntelHex(memory) {
  const addresses = [...memory.keys()].sort((left, right) => left - right);
  const lines = [];
  let currentUpper = -1;
  for (let cursor = 0; cursor < addresses.length;) {
    const absolute = addresses[cursor];
    const upper = absolute >>> 16;
    if (upper !== currentUpper) {
      lines.push(hexRecord(0, 0x04, new Uint8Array([(upper >>> 8) & 0xff, upper & 0xff])));
      currentUpper = upper;
    }
    const low = absolute & 0xffff;
    const data = [];
    while (cursor < addresses.length && data.length < 16
      && addresses[cursor] === absolute + data.length
      && (addresses[cursor] >>> 16) === upper) {
      data.push(memory.get(addresses[cursor]));
      cursor += 1;
    }
    lines.push(hexRecord(low, 0x00, new Uint8Array(data)));
  }
  lines.push(":00000001FF");
  return `${lines.join("\n")}\n`;
}

export function publicKeyId(publicKeyRaw) {
  return crc32(publicKeyRaw);
}

export function metadataBytes(manifestBytes) {
  if (manifestBytes.byteLength !== MANIFEST_SIZE) throw new Error("Unexpected manifest size for metadata.");
  const metadata = new Uint8Array(MANIFEST_SIZE + 4);
  metadata.set(manifestBytes, 0);
  writeU32(metadata, MANIFEST_SIZE, METADATA_COMMIT);
  return metadata;
}

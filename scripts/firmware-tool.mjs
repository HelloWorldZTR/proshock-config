#!/usr/bin/env node

import {
  chmod,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import path from "node:path";
import { homedir } from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  APP_BASE,
  APP_END,
  MANIFEST_SIZE,
  METADATA_BASE,
  buildUnsignedManifest,
  crc32,
  encodeIntelHex,
  formatVersion,
  metadataBytes,
  parseFirmwarePackage,
  parseIntelHex,
  parseVersion,
  publicKeyId,
  signatureMessage,
  xteaCtrCrypt,
} from "../src/firmware-format.js";

function parseArguments(argv) {
  const values = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      values._.push(item);
      continue;
    }
    const name = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}.`);
    values[name] = value;
    index += 1;
  }
  return values;
}

function required(args, name) {
  if (!args[name]) throw new Error(`Missing required --${name}.`);
  return args[name];
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function rawPublicKey(publicKeyDer) {
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  if (publicKeyDer.byteLength !== 44 || !publicKeyDer.subarray(0, 12).equals(prefix)) {
    throw new Error("Unexpected Ed25519 SPKI encoding.");
  }
  return new Uint8Array(publicKeyDer.subarray(12));
}

function publicHeader(publicRaw, keyId) {
  const rows = [];
  for (let offset = 0; offset < publicRaw.byteLength; offset += 8) {
    rows.push(`    ${[...publicRaw.slice(offset, offset + 8)]
      .map((value) => `0x${value.toString(16).padStart(2, "0")}U`).join(", ")}`);
  }
  return `/* Generated public material. The private key is never stored here. */
#ifndef PROSHOCK_IAP_PUBLIC_KEY_H
#define PROSHOCK_IAP_PUBLIC_KEY_H

#include <stdint.h>

#define PROSHOCK_IAP_SIGNING_KEY_ID 0x${keyId.toString(16).padStart(8, "0")}UL

static const uint8_t proshock_iap_public_key[32] = {
${rows.join(",\n")}
};

#endif /* PROSHOCK_IAP_PUBLIC_KEY_H */
`;
}

function publicJavascript(publicRaw, keyId) {
  return `/* Generated public material. Safe to distribute with the Portal. */
export const FIRMWARE_SIGNING_KEY_ID = 0x${keyId.toString(16).padStart(8, "0")};
export const FIRMWARE_SIGNING_PUBLIC_KEY = new Uint8Array([
  ${[...publicRaw].map((value) => `0x${value.toString(16).padStart(2, "0")}`).join(", ")},
]);
`;
}

async function writeExclusive(target, data, mode) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data, { flag: fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, mode });
}

async function keygen(args) {
  const portalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repositoryRoot = path.resolve(portalRoot, "../..");
  const outputDirectory = path.resolve(args.out
    || path.join(homedir(), ".ssh", "proshock4-firmware-signing"));
  const headerPath = path.resolve(args["public-header"]
    || path.join(repositoryRoot, "usb_device/ch32v30x_iap/User/proshock_iap_public_key.h"));
  const javascriptPath = path.resolve(args["public-js"]
    || path.join(portalRoot, "src/firmware-public-key.js"));
  const candidates = [outputDirectory, headerPath, javascriptPath].filter(Boolean);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) throw new Error(`Refusing to overwrite existing path: ${candidate}`);
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
  const publicPem = publicKey.export({ format: "pem", type: "spki" });
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const publicRaw = rawPublicKey(publicDer);
  const keyId = publicKeyId(publicRaw);
  const fingerprint = createHash("sha256").update(publicRaw).digest("hex");

  await mkdir(outputDirectory, { mode: 0o700 });
  const privatePath = path.join(outputDirectory, "firmware-ed25519-private.pem");
  const publicPath = path.join(outputDirectory, "firmware-ed25519-public.pem");
  await writeExclusive(privatePath, privatePem, 0o600);
  await writeExclusive(publicPath, publicPem, 0o644);
  await chmod(outputDirectory, 0o700);
  await chmod(privatePath, 0o600);
  if (headerPath) await writeExclusive(headerPath, publicHeader(publicRaw, keyId), 0o644);
  if (javascriptPath) await writeExclusive(javascriptPath, publicJavascript(publicRaw, keyId), 0o644);
  process.stdout.write(`Ed25519 public fingerprint: SHA256:${fingerprint}\nKey ID: 0x${keyId.toString(16).padStart(8, "0")}\n`);
}

function parseNonce(value) {
  if (!value) return new Uint8Array(randomBytes(8));
  if (!/^[0-9a-fA-F]{16}$/.test(value)) throw new Error("--nonce must contain exactly 16 hexadecimal characters.");
  return new Uint8Array(Buffer.from(value, "hex"));
}

async function packFirmware(args) {
  const hexPath = path.resolve(required(args, "hex"));
  const privateKeyPath = path.resolve(required(args, "private-key"));
  const outputPath = path.resolve(required(args, "out"));
  if (await pathExists(outputPath)) throw new Error(`Refusing to overwrite existing path: ${outputPath}`);
  const versionCode = parseVersion(required(args, "version"));
  const minimumIapVersion = Number(args["min-iap"] || 1);
  if (!Number.isInteger(minimumIapVersion)
      || minimumIapVersion < 1 || minimumIapVersion > 0xffff) {
    throw new Error("--min-iap must be an integer from 1 to 65535.");
  }
  const { payload } = parseIntelHex(await readFile(hexPath, "utf8"));
  const privatePem = await readFile(privateKeyPath);
  const privateKey = (await import("node:crypto")).createPrivateKey(privatePem);
  const publicDer = (await import("node:crypto")).createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const publicRaw = rawPublicKey(publicDer);
  const nonce = parseNonce(args.nonce);
  const ciphertext = xteaCtrCrypt(payload, nonce);
  const plaintextSha512 = new Uint8Array(createHash("sha512").update(payload).digest());
  const unsigned = buildUnsignedManifest({
    payloadLength: payload.byteLength,
    versionCode,
    minimumIapVersion,
    keyId: publicKeyId(publicRaw),
    nonce,
    plaintextCrc32: crc32(payload),
    ciphertextCrc32: crc32(ciphertext),
    plaintextSha512,
  });
  const signature = sign(null, signatureMessage(unsigned), privateKey);
  const packageBytes = new Uint8Array(MANIFEST_SIZE + ciphertext.byteLength);
  packageBytes.set(unsigned, 0);
  packageBytes.set(signature, 128);
  packageBytes.set(ciphertext, MANIFEST_SIZE);
  await writeExclusive(outputPath, packageBytes, 0o644);
  process.stdout.write(`Packed ${formatVersion(versionCode)} (${payload.byteLength} bytes)\n`);
}

async function verifyWithPublicKey(packageBytes, publicKeyPath) {
  const parsed = parseFirmwarePackage(packageBytes);
  const publicPem = await readFile(publicKeyPath);
  if (!verify(null, signatureMessage(parsed.manifest.unsigned), publicPem, parsed.manifest.signature)) {
    throw new Error("Firmware signature is invalid.");
  }
  const plaintext = xteaCtrCrypt(parsed.ciphertext, parsed.manifest.nonce);
  const digest = new Uint8Array(createHash("sha512").update(plaintext).digest());
  if (crc32(plaintext) !== parsed.manifest.plaintextCrc32
      || !Buffer.from(digest).equals(Buffer.from(parsed.manifest.plaintextSha512))) {
    throw new Error("Firmware plaintext integrity check failed.");
  }
  return { ...parsed, plaintext };
}

async function inspectFirmware(args) {
  const packagePath = path.resolve(required(args, "package"));
  const publicKeyPath = path.resolve(required(args, "public-key"));
  const parsed = await verifyWithPublicKey(new Uint8Array(await readFile(packagePath)), publicKeyPath);
  process.stdout.write(`${JSON.stringify({
    version: formatVersion(parsed.manifest.versionCode),
    targetBoardId: `0x${parsed.manifest.targetBoardId.toString(16)}`,
    appBase: `0x${parsed.manifest.appBase.toString(16)}`,
    payloadLength: parsed.manifest.payloadLength,
    minimumIapVersion: parsed.manifest.minimumIapVersion,
    keyId: `0x${parsed.manifest.keyId.toString(16).padStart(8, "0")}`,
    signature: "valid",
  }, null, 2)}\n`);
}

function parseAnyIntelHex(text) {
  const memory = new Map();
  let upper = 0;
  let eof = false;
  for (const [lineIndex, raw] of text.replace(/\r/g, "").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith(":")) throw new Error(`Intel HEX line ${lineIndex + 1} is invalid.`);
    const bytes = [];
    for (let index = 1; index < line.length; index += 2) bytes.push(Number.parseInt(line.slice(index, index + 2), 16));
    if (bytes.some((value) => !Number.isInteger(value))
      || (bytes.reduce((sum, value) => sum + value, 0) & 0xff) !== 0
      || bytes.length !== bytes[0] + 5) throw new Error(`Intel HEX line ${lineIndex + 1} failed validation.`);
    const address = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.slice(4, 4 + bytes[0]);
    if (type === 0) data.forEach((value, index) => memory.set((upper + address + index) >>> 0, value));
    else if (type === 1) eof = true;
    else if (type === 2) upper = (((data[0] << 8) | data[1]) << 4) >>> 0;
    else if (type === 4) upper = (((data[0] << 8) | data[1]) << 16) >>> 0;
    else if (type !== 3 && type !== 5) throw new Error(`Unsupported Intel HEX record type ${type}.`);
  }
  if (!eof) throw new Error("Intel HEX EOF record is missing.");
  return memory;
}

async function factoryImage(args) {
  const bootloaderPath = path.resolve(required(args, "bootloader"));
  const packagePath = path.resolve(required(args, "package"));
  const publicKeyPath = path.resolve(required(args, "public-key"));
  const outputPath = path.resolve(required(args, "out"));
  if (await pathExists(outputPath)) throw new Error(`Refusing to overwrite existing path: ${outputPath}`);
  const bootloader = parseAnyIntelHex(await readFile(bootloaderPath, "utf8"));
  const packageBytes = new Uint8Array(await readFile(packagePath));
  const parsed = await verifyWithPublicKey(packageBytes, publicKeyPath);
  const output = new Map();
  bootloader.forEach((value, rawAddress) => {
    const address = rawAddress < 0x08000000 ? rawAddress + 0x08000000 : rawAddress;
    if (address < 0x08000000 || address >= METADATA_BASE) {
      throw new Error(`Bootloader HEX escapes its partition at 0x${address.toString(16)}.`);
    }
    output.set(address, value);
  });
  metadataBytes(parsed.manifestBytes).forEach((value, index) => output.set(METADATA_BASE + index, value));
  parsed.plaintext.forEach((value, index) => output.set(APP_BASE + index, value));
  for (const address of output.keys()) {
    if (address >= APP_END) throw new Error("Factory image must not contain config bytes.");
  }
  await writeExclusive(outputPath, encodeIntelHex(output), 0o644);
  process.stdout.write(`Factory image contains ${output.size} bytes and omits both config slots.\n`);
}

function usage() {
  return `Usage:
  firmware-tool.mjs keygen [--out DIR] [--public-header FILE] [--public-js FILE]
  firmware-tool.mjs pack --hex APP.hex --version X.Y.Z --private-key KEY.pem --out FILE.ps4fw
  firmware-tool.mjs inspect --package FILE.ps4fw --public-key PUBLIC.pem
  firmware-tool.mjs factory-image --bootloader IAP.hex --package FILE.ps4fw --public-key PUBLIC.pem --out FACTORY.hex
`;
}

/** @brief Dispatch the firmware release CLI without exposing private material. */
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArguments(rest);
  if (command === "keygen") await keygen(args);
  else if (command === "pack") await packFirmware(args);
  else if (command === "inspect") await inspectFirmware(args);
  else if (command === "factory-image") await factoryImage(args);
  else throw new Error(usage());
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

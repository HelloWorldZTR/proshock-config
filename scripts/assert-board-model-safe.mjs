import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Approved 2026-09-30 JLC export: PCB, components and silkscreen only.
// Signal-layer traces and vias were left unchecked in the export dialog.
const expectedSha256 = "1df6d372ca0ce2291034185844d84eac6d842033f08df4a14de49275d9511aee";
const model = new URL("../src/assets/proshock-board.glb", import.meta.url);
const actualSha256 = createHash("sha256").update(readFileSync(model)).digest("hex");

if (actualSha256 !== expectedSha256) {
  throw new Error("Board model differs from the approved no-trace export. Verify the JLC export excludes signal-layer traces before updating its hash.");
}

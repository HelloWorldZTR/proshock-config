import test from "node:test";
import assert from "node:assert/strict";
import { cloneMacroDraft } from "./macro-editor.js";
import { createDefaultResolver, parseResolver, validateResolver, writeResolver } from "./resolver-schema.js";

test("editing macro timing preserves every legal playback combination through encoding", () => {
  for (const mode of [0, 1, 2]) for (const loop of [false, true]) for (const hold_last of [false, true]) {
    if (mode === 0 && hold_last) continue;
    const resolver = createDefaultResolver();
    resolver.macros.push({ mode, loop, hold_last, steps: [{ output_mask: 2, duration_4ms: 10 }] });
    const bytes = new Uint8Array(256);
    writeResolver(bytes, resolver);
    const loaded = parseResolver(bytes);
    const draft = cloneMacroDraft(loaded.macros[0]);
    draft.steps[0].duration_4ms = 25;
    assert.equal(loaded.macros[0].steps[0].duration_4ms, 10);
    loaded.macros[0] = draft;
    writeResolver(bytes, loaded);
    const saved = parseResolver(bytes).macros[0];
    assert.deepEqual([saved.mode, saved.loop, saved.hold_last], [mode, loop, hold_last]);
    assert.equal(saved.steps[0].duration_4ms, 25);
  }
});

test("invalid Once hold remains visible to validation instead of being silently cleared", () => {
  const resolver = createDefaultResolver();
  resolver.macros.push(cloneMacroDraft({ mode: 0, hold_last: true, steps: [{ output_mask: 2, duration_4ms: 1 }] }));
  assert.match(validateResolver(resolver)[0], /Once/);
});

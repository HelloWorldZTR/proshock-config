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

import { insertMacroStep, moveMacroStep, parseStepDuration, removeMacroSlot, resolveMacroSteps } from "./macro-editor.js";
import { ACTION } from "./resolver-schema.js";

test("duration drafts reject invalid input and quantize explicitly without config-only fields", () => {
  for (const value of ["", " ", "no", -1, 0, 3, 1021, Infinity]) assert.ok(parseStepDuration(value).error);
  for (const [value, expected] of [[4, 4], [1020, 1020], [5, 4], [6, 8], [1019, 1020]]) {
    assert.equal(parseStepDuration(value).milliseconds, expected);
  }
  const raw = [{ output_mask: 0, duration_4ms: 1, duration_input: "10" }];
  assert.deepEqual(resolveMacroSteps(raw), { steps: [{ output_mask: 0, duration_4ms: 3 }], totalMs: 12, error: "" });
  assert.equal(raw[0].duration_4ms, 1);
  assert.ok(resolveMacroSteps([{ ...raw[0], duration_input: "" }]).error);
});

test("insert and move preserve outputs, timing, selection and shared capacity", () => {
  const steps = [{ output_mask: 2, duration_4ms: 1, duration_input: "20" }];
  assert.equal(insertMacroStep(steps, 1, 3, steps[0]), true);
  steps[1].output_mask = 4;
  assert.equal(steps[0].output_mask, 2);
  assert.equal(insertMacroStep(steps, 1, 3), true);
  assert.equal(insertMacroStep(steps, 3, 3), false);
  assert.equal(moveMacroStep(steps, 2, 0, 2), 0);
  assert.deepEqual(steps.map((step) => step.output_mask), [4, 2, 0]);
  assert.equal(resolveMacroSteps(steps).totalMs, 140);
  assert.equal(moveMacroStep(steps, 0, -1, 0), 0);
});

test("deleting a macro repairs base, layer and combo references without touching other families", () => {
  const resolver = createDefaultResolver();
  resolver.macros = Array.from({ length: 3 }, () => cloneMacroDraft({ steps: [{ output_mask: 2, duration_4ms: 1 }] }));
  resolver.base_mapping[0] = ACTION.MACRO_FIRST;
  resolver.base_mapping[1] = ACTION.MACRO_FIRST + 1;
  resolver.base_mapping[2] = ACTION.MACRO_FIRST + 2;
  resolver.layers[0].overrides = [{ source_id: 0, action_id: ACTION.MACRO_FIRST + 2 }];
  resolver.combos = [{ action_id: ACTION.MACRO_FIRST + 1 }];
  const other = resolver.base_mapping[3];
  removeMacroSlot(resolver, 1);
  assert.deepEqual(resolver.base_mapping.slice(0, 3), [ACTION.MACRO_FIRST, ACTION.NONE, ACTION.MACRO_FIRST + 1]);
  assert.equal(resolver.base_mapping[3], other);
  assert.equal(resolver.layers[0].overrides[0].action_id, ACTION.MACRO_FIRST + 1);
  assert.equal(resolver.combos[0].action_id, ACTION.NONE);
  assert.equal(resolver.macros.length, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION,
  RESOLVER_OFFSET,
  RESOLVER_SIZE,
  createDefaultResolver,
  parseResolver,
  validateResolver,
  writeResolver,
} from "./resolver-schema.js";

test("Resolver defaults and packed layout match the firmware contract", () => {
  const payload = new Uint8Array(256);
  const resolver = createDefaultResolver();
  writeResolver(payload, resolver);
  const parsed = parseResolver(payload);
  assert.equal(RESOLVER_OFFSET, 104);
  assert.equal(RESOLVER_SIZE, 152);
  assert.equal(parsed.base_mapping[0], ACTION.GAMEPAD_FIRST);
  assert.equal(parsed.base_mapping[17], ACTION.GAMEPAD_FIRST + 17);
  assert.equal(parsed.base_mapping[18], ACTION.NONE);
  assert.deepEqual(validateResolver(parsed), []);
});

test("Resolver round trip preserves sparse pools and Macro timing", () => {
  const payload = new Uint8Array(256);
  const resolver = createDefaultResolver();
  resolver.layers[0].overrides.push({ source_id: 18, action_id: 2 });
  resolver.combos.push({
    input_mask: 3, action_id: 4, leader_source_id: 0, consume: true, exact: false,
  });
  resolver.macros.push({
    mode: 1, loop: true, hold_last: false,
    steps: [{ output_mask: 2, duration_4ms: 10 }, { output_mask: 0, duration_4ms: 10 }],
  });
  resolver.base_mapping[19] = ACTION.MACRO_FIRST;
  writeResolver(payload, resolver);
  const parsed = parseResolver(payload);
  assert.deepEqual(parsed.layers[0].overrides, resolver.layers[0].overrides);
  assert.deepEqual(parsed.combos[0], { ...resolver.combos[0], enabled: true });
  assert.equal(parsed.macros[0].mode, resolver.macros[0].mode);
  assert.equal(parsed.macros[0].loop, resolver.macros[0].loop);
  assert.equal(parsed.macros[0].hold_last, resolver.macros[0].hold_last);
  assert.deepEqual(parsed.macros[0].steps, resolver.macros[0].steps);
  assert.deepEqual(validateResolver(parsed), []);
});

test("Host validator allows held Combo Actions and rejects ambiguous chords", () => {
  const resolver = createDefaultResolver();
  resolver.base_mapping[26] = 1;
  assert.match(validateResolver(resolver)[0], /reserved/i);
  resolver.base_mapping[26] = 0;
  resolver.macros.push({
    mode: 1, loop: false, hold_last: true,
    steps: [{ output_mask: 2, duration_4ms: 1 }],
  });
  resolver.combos.push({
    input_mask: 3, action_id: ACTION.MACRO_FIRST, leader_source_id: 0,
    consume: true, exact: false,
  });
  assert.deepEqual(validateResolver(resolver), []);
  resolver.combos[0].action_id = ACTION.LAYER_1_MOMENTARY;
  assert.deepEqual(validateResolver(resolver), []);

  resolver.combos[0].input_mask = 1;
  assert.match(validateResolver(resolver)[0], /at least two/i);
  resolver.combos[0].input_mask = 3;
  resolver.combos.push({
    input_mask: 7, action_id: 1, leader_source_id: 0,
    consume: true, exact: false,
  });
  assert.match(validateResolver(resolver)[0], /same Leader/i);

  resolver.combos = [{
    input_mask: (1 << 12) | (1 << 14) | 1,
    action_id: 1, leader_source_id: 0, consume: true, exact: false,
  }];
  assert.match(validateResolver(resolver)[0], /system shortcut/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEYBOARD_ACTIONS, createDefaultResolver, validateResolver, writeResolver,
  parseResolver, resolverForVersion, canMapKeyboard,
} from './resolver-schema.js';
import { parseProfile, PROFILE_SIZE, writeProfileDraftToPayload, createLinearResponse } from './protocol.js';
import { exportProfile, importProfile } from './services/import-export.js';

function profile(version = 2) {
  const raw = new Uint8Array(PROFILE_SIZE);
  const item = {
    raw, profile_version: 7, flags: 0, color_rgb: [1,2,3], pollrate_hz: 1000,
    button_debounce_samples: 8,
    stick_response: Array.from({length:2}, () => createLinearResponse()),
    trigger_response: Array.from({length:2}, () => createLinearResponse()),
    resolver: {...createDefaultResolver(), resolver_version: version},
  };
  writeProfileDraftToPayload(raw, item);
  return parseProfile(raw);
}

test('keyboard action vectors match standard usages and fit the existing byte fields', () => {
  assert.equal(KEYBOARD_ACTIONS.length, 120);
  for (const [id, usage, label] of [[0x80,4,'A'], [0x99,29,'Z'], [0xef,0x73,'F24'], [0xf0,0xe0,'Left Ctrl'], [0xf7,0xe7,'Right GUI']]) {
    assert.deepEqual(KEYBOARD_ACTIONS.find(x => x.id === id), { id, usage, family:'Keyboard', label });
  }
  assert.equal(new Set(KEYBOARD_ACTIONS.map(x => x.id)).size, 120);
});

test('only connected non-trigger base mappings accept keyboard actions', () => {
  for (let source = 0; source < 28; source++) {
    const resolver = createDefaultResolver();
    resolver.base_mapping[source] = 0x80;
    assert.equal(validateResolver(resolver).length === 0, source < 26 && ![6,7].includes(source));
    assert.equal(canMapKeyboard(resolver, source), source < 26 && ![6,7].includes(source));
  }
  const resolver = createDefaultResolver();
  resolver.layers[0].overrides.push({source_id:0, action_id:0x80});
  assert.ok(validateResolver(resolver).length);
  resolver.layers[0].overrides = [];
  resolver.combos.push({input_mask:3, leader_source_id:0, action_id:0x80, enabled:true});
  assert.ok(validateResolver(resolver).length);
  resolver.combos = [];
  resolver.macros.push({mode:0, steps:[{output_mask:1 << 20, duration_4ms:1}]});
  assert.ok(validateResolver(resolver).length);
});

test('Resolver v1 round trips unchanged; v2 adds keys without increasing payload size', () => {
  const resolver = createDefaultResolver();
  const raw = new Uint8Array(384);
  resolver.resolver_version = 1;
  writeResolver(raw, resolver);
  assert.equal(raw[104], 1);
  assert.equal(parseResolver(raw).resolver_version, 1);
  resolver.resolver_version = 2;
  resolver.base_mapping[0] = 0xef;
  resolver.base_mapping[18] = 0xf7;
  writeResolver(raw, resolver);
  assert.equal(parseResolver(raw).base_mapping[0], 0xef);
  assert.equal(raw.length, 384);
  assert.throws(() => resolverForVersion(resolver, 1), /keyboard/);
});

test('imports adapt to the target Resolver and reject keyboard data for legacy devices', () => {
  const old = profile(1), current = profile(2);
  assert.equal(importProfile(exportProfile(old), 0, current.raw).resolver.resolver_version, 2);
  assert.equal(importProfile(exportProfile(current), 0, old.raw).resolver.resolver_version, 1);
  current.resolver.base_mapping[0] = 0x80;
  assert.throws(() => importProfile(exportProfile(current), 0, old.raw), /keyboard/);
  assert.throws(() => writeProfileDraftToPayload(new Uint8Array(current.raw), current, {targetVersion:1}), /keyboard/);
});

test('keyboard UI is gated to base mappings, supported firmware, and allowed sources', () => {
  const source = readFileSync(new URL('./components/ResolverEditor.vue', import.meta.url), 'utf8');
  assert.match(source, /!editingLayer.value && selectedComboIndex.value === null/);
  assert.match(source, /canMapKeyboard\(resolver.value, selectedSource.value\)/);
  assert.match(source, /v-model="keyboardQuery"/);
  assert.match(source, /action.family === "Keyboard"\) return action.id >= 0xf0 \? "Modifier key" : "Keyboard key"/);
});

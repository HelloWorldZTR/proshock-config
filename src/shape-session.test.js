import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Vue from 'vue';
import { parse } from '@vue/compiler-sfc';

const { descriptor } = parse(fs.readFileSync(new URL('./components/StickRoundnessEditor.vue', import.meta.url), 'utf8'));
const imports = {};
for (const match of descriptor.scriptSetup.content.matchAll(/import\s+\{([^}]+)\}\s+from\s+"([^"]+)";/g)) {
  const module = match[2] === 'vue' ? Vue : await import(new URL(match[2].replace('../', './'), import.meta.url));
  for (const name of match[1].split(',').map(v => v.trim()).filter(Boolean)) imports[name] = module[name];
}
const source = descriptor.scriptSetup.content.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, '');

/** @brief Verify capture lifecycle using the real editor watchers and sample pipeline. */
test('new snapshots accumulate; stick switching preserves captures; runtime changes invalidate them', async () => {
  const props = Vue.reactive({
    canTest: true,
    profile: {stick_shape: [{scale_q15:Array(16).fill(32768)}, {scale_q15:Array(16).fill(32768)}]},
    snapshot: {runtime_generation:1, output_stick_q15:[0,0,0,0]},
  });
  const context = vm.createContext({ ...imports, onBeforeUnmount() {}, defineProps: () => props, defineEmits: () => () => {}, window: {requestAnimationFrame: () => 1, cancelAnimationFrame() {}} });
  const scope = Vue.effectScope();
  const api = scope.run(() => vm.runInContext(source + '\n({toggleTest, captures, testActive, selectedStick})', context));
  api.toggleTest();
  for (const values of [[32767,0,0,0], [0,32767,0,0]]) {
    props.snapshot = {runtime_generation:1, output_stick_q15:values};
    await Vue.nextTick();
  }
  assert.equal(api.testActive.value, true);
  assert.equal(api.captures.value[0].sampleCount, 2);
  assert.equal(api.captures.value[1].sampleCount, 0);
  api.selectedStick.value = 1;
  await Vue.nextTick();
  assert.equal(api.testActive.value, false);
  assert.equal(api.captures.value[0].sampleCount, 2);
  props.snapshot = {runtime_generation:2, output_stick_q15:[0,0,32767,0]};
  await Vue.nextTick();
  assert.equal(api.captures.value[0].sampleCount, 0);
  props.canTest = false;
  await Vue.nextTick();
  api.toggleTest();
  assert.equal(api.testActive.value, false);
  scope.stop();
});

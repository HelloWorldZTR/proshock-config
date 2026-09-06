import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Vue from 'vue';
import { parse } from '@vue/compiler-sfc';

// Exercise the actual App handlers with transport and lifecycle boundaries stubbed.
const { descriptor } = parse(fs.readFileSync(new URL('./App.vue', import.meta.url), 'utf8'));
const imports = {};
for (const match of descriptor.scriptSetup.content.matchAll(/import\s+\{([^}]+)\}\s+from\s+"([^"]+)";/g)) {
  const module = match[2] === 'vue' ? Vue : await import(new URL(match[2], import.meta.url));
  for (const name of match[1].split(',').map(v => v.trim()).filter(Boolean)) imports[name] = module[name];
}
const source = descriptor.scriptSetup.content.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, '').replace('import.meta.env.MODE', '"production"');
/** @brief Run application state without a DOM or physical controller. */
function harness() {
  const device = { productName: 'Test controller', opened: true };
  class FakeClient {
    device = device;
    get connected() { return this.device?.opened; }
    async connect() { return this.device; }
    async close() { this.device = null; }
  }
  const context = vm.createContext({
    ...imports, WebHidClient: FakeClient, onMounted: () => {}, onUnmounted: () => {},
    window: { isSecureContext: true, setTimeout: () => 1, clearInterval() {}, clearTimeout() {}, setInterval: () => 1 },
    location: { protocol: 'http:', hash: '' }, history: { replaceState() {} }, document: { activeElement: null }, navigator: {},
  });
  vm.runInContext(source + `
    profileDraft.value = createFallbackProfile();
    calibrationDraft.value = clone(defaultCalibration);
    profileBackup.value = clone(profileDraft.value);
    calibrationBackup.value = clone(calibrationDraft.value);
    startSnapshotPolling = () => {};
  `, context);
  return code => vm.runInContext(code, context);
}

test('failed initial configuration load never opens the connection gate', async () => {
  const run = harness();
  run('page.value = "configurator"; refreshAll = async () => false');
  await run('connectFlow()');
  assert.equal(run('connected.value'), false);
  assert.equal(run('connectionBlocked.value'), true);
  assert.match(run('connectionError.value'), /Could not load/);
});

test('connection stays gated until asynchronous initialization completes', async () => {
  const run = harness();
  run('page.value = "configurator"; let resolveLoad; refreshAll = () => new Promise(resolve => { resolveLoad = resolve; })');
  const pending = run('connectFlow()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run('connected.value'), false);
  assert.equal(run('connectionBlocked.value'), true);
  run('resolveLoad(true)');
  await pending;
  assert.equal(run('connected.value'), true);
  assert.equal(run('connectionBlocked.value'), false);
});

test('manual bounds enable shared Apply, invalid endpoints block it, wizard owns its own actions', () => {
  const run = harness();
  run('connected.value = true; page.value = "calibration"; calibrationSection.value = "manual"; setCalibrationBound({kind:"axis",index:0,field:"raw_min",value:10})');
  assert.equal(run('canApply.value'), true);
  assert.equal(run('configuratorApplyState.value.disabled'), false);
  run('setCalibrationBound({kind:"trigger",index:0,field:"raw_released",value:NaN})');
  assert.equal(run('canApply.value'), false);
  run('calibrationDraft.value = clone(defaultCalibration); calibrationSection.value = "automatic"; wizardStep.value = "sticks-range"; profileDraft.value.pollrate_hz = 8000');
  assert.equal(run('canApply.value'), false);
  assert.equal(run('configuratorApplyState.value.disabled'), true);
});

test('both Apply entry points are blocked during save; a second Save cannot start', async () => {
  const run = harness();
  run('connected.value = true; configInfo.value = {dirty:true, boot_profile:0}; let releaseCommand; let commands = 0; command = () => {commands++; return new Promise(resolve => {releaseCommand = resolve})}');
  const saving = run('saveConfig()');
  assert.equal(run('canSave.value'), false);
  assert.equal(run('configuratorApplyState.value.disabled'), true);
  assert.equal(await run('saveConfig()'), false);
  assert.equal(run('commands'), 1);
  // Simulate an error from the first command to finish the pending operation.
  run('releaseCommand({payload:null})');
  await saving;
  assert.equal(run('saveInProgress.value'), false);
});

test('manual centers accept edits and enforce the 128 ADC boundary on both sides', () => {
  const run = harness();
  run('connected.value = true; page.value = "calibration"; calibrationSection.value = "manual"; setCalibrationBound({kind:"axis",index:0,field:"raw_min",value:0}); setCalibrationBound({kind:"axis",index:0,field:"raw_max",value:4095})');
  for (const [center, valid] of [[127, false], [128, true], [3967, true], [3968, false], [NaN, false]]) {
    run(`setCalibrationBound({kind:"axis",index:0,field:"raw_center",value:${center}})`);
    assert.equal(run('calibrationDraft.value.axis[0].raw_center'), center);
    assert.equal(run('canApply.value'), valid);
  }
});

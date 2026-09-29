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
function harness({ timers = [] } = {}) {
  const device = { productName: 'Test controller', opened: true };
  class FakeClient {
    device = device;
    get connected() { return this.device?.opened; }
    async connect() { return this.device; }
    async close() { this.device = null; }
  }
  const context = vm.createContext({
    ...imports, WebHidClient: FakeClient, onMounted: () => {}, onUnmounted: () => {},
    window: { isSecureContext: true, setTimeout: callback => {
      timers.push(callback);
      return 1;
    }, clearInterval() {}, clearTimeout() {}, setInterval: () => 1 },
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

test('ribbon mode applies a global flag, preserves other flags and leaves profiles/calibration alone', async () => {
  const run = harness();
  run('connected.value = true; page.value = "configurator"; configInfo.value = {boot_profile:0, feature_flags:0x80000000, ribbon_mode_supported:true}; let originalProfile = JSON.stringify(profileDraft.value); let originalCalibration = JSON.stringify(calibrationDraft.value); let sentFlags; command = async (id,payload) => {sentFlags = new DataView(payload.buffer).getUint32(8,true); const info = new Uint8Array(56); new DataView(info.buffer).setUint32(24,sentFlags,true); info[55] = 1; return {payload:info}}; pollAnalogSnapshot = async () => {}; setRibbonMode(1)');
  assert.equal(run('globalChanged.value'), true);
  assert.equal(run('canApply.value'), true);
  await run('applyDraft()');
  assert.equal(run('sentFlags'), 0x80000001);
  assert.equal(run('globalChanged.value'), false);
  assert.equal(run('JSON.stringify(profileDraft.value) === originalProfile'), true);
  assert.equal(run('JSON.stringify(calibrationDraft.value) === originalCalibration'), true);
  run('setRibbonMode(0)');
  assert.equal(run('draftFeatureFlags.value'), 0x80000000);
  run('restoreLocalBaselines()');
  assert.equal(run('ribbonMode.value'), 1);
});

test('ribbon mode rejects unsupported firmware and keeps later edits during Apply', async () => {
  const run = harness();
  run('connected.value = true; page.value = "configurator"; configInfo.value = {boot_profile:0, feature_flags:0}; setRibbonMode(1)');
  assert.equal(run('ribbonMode.value'), 0);
  run('configInfo.value.ribbon_mode_supported = true; setRibbonMode(1); let finish; command = () => new Promise(resolve => {finish = resolve}); pollAnalogSnapshot = async () => {}');
  const applying = run('applyDraft()');
  run('ribbonMode.value = 0; const info = new Uint8Array(56); new DataView(info.buffer).setUint32(24,1,true); info[55] = 1; finish({payload:info})');
  await applying;
  assert.equal(run('ribbonMode.value'), 0);
  assert.equal(run('globalChanged.value'), true);
  run('captureSavedBaselines()');
  assert.equal(run('savedGlobalBaseline.value.feature_flags'), 1);
});

test('hardware direction edits are global calibration drafts and preserve profile and ADC data', () => {
  const run = harness();
  run('connected.value = true; page.value = "configurator"; latestRaw.value = {adc:[100,200,300,400,3900,100]}; let originalProfile = JSON.stringify(profileDraft.value); let originalAxis = JSON.stringify(calibrationDraft.value.axis); setAnalogDirection({channel:0,inverted:true}); setAnalogDirection({channel:4,inverted:true})');
  assert.equal(run('calibrationDraft.value.direction_mask'), 17);
  assert.equal(run('JSON.stringify(profileDraft.value) === originalProfile'), true);
  assert.equal(run('JSON.stringify(calibrationDraft.value.axis) === originalAxis'), true);
  assert.equal(run('latestRaw.value.adc[0]'), 100);
  assert.equal(run('calibrationDraft.value.trigger[0].raw_released'), 4085);
  assert.equal(run('draftAxisInvert.value[0]'), true);
  assert.equal(run('calibrationChanged.value'), true);
  assert.equal(run('profileChanged.value'), false);
  assert.equal(run('canApply.value'), true);
  run('busy.value = true; setAnalogDirection({channel:0,inverted:false})');
  assert.equal(run('calibrationDraft.value.direction_mask'), 17);
});

test('ADC depth Apply preserves other flags and calibration, and later edits remain drafts', async () => {
  const run = harness();
  run(`connected.value = true; configInfo.value = {boot_profile:0, feature_flags:0x80000001, adc_depth_supported:true}; ribbonMode.value = 1;
    const physicalBefore = JSON.stringify(calibrationDraft.value);
    setAdcBits(14); let submittedFlags; let finish;
    command = (id,payload) => {submittedFlags = new DataView(payload.buffer).getUint32(8,true); return new Promise(resolve => {finish=resolve})};
    pollAnalogSnapshot = async () => {};`);
  assert.equal(run('canApply.value'), true);
  const applying = run('applyDraft()');
  run(`adcBits.value = 10; const payload = new Uint8Array(56); new DataView(payload.buffer).setUint32(24,submittedFlags,true); payload[55] = 3; finish({payload})`);
  await applying;
  assert.equal(run('submittedFlags'), 0x80000007);
  assert.equal(run('configInfo.value.adc_bits'), 14);
  assert.equal(run('adcBits.value'), 10);
  assert.equal(run('globalChanged.value'), true);
  assert.equal(run('JSON.stringify(calibrationDraft.value) === physicalBefore'), true);
  run('captureSavedBaselines(); restoreLocalBaselines()');
  assert.equal(run('savedGlobalBaseline.value.feature_flags'), 0x80000007);
  assert.equal(run('adcBits.value'), 14);
  assert.equal(run('globalChanged.value'), false);
});

test('ADC depth rejects unavailable modes and preserves legacy unknown bits', () => {
  const run = harness();
  run('connected.value = true; configInfo.value = {boot_profile:0,feature_flags:0x80000006}; setAdcBits(8)');
  assert.equal(run('adcBits.value'), 12);
  assert.equal(run('draftFeatureFlags.value'), 0x80000006);
  run('configInfo.value.adc_depth_supported=true; setAdcBits(16); setAdcBits(18)');
  assert.equal(run('adcBits.value'), 12);
  run('setAdcBits(8)');
  assert.equal(run('adcBits.value'), 8);
  run('busy.value=true; setAdcBits(14)');
  assert.equal(run('adcBits.value'), 8);
});

test('ADC depth follows Apply then Save and reloads the applied baseline', async () => {
  const run = harness();
  run(`connected.value = true; configInfo.value={boot_profile:0,feature_flags:0,dirty:false,adc_depth_supported:true};
    let storedFlags=0; let dirty=0;
    command = async (id,payload) => {
      if(id === COMMAND.SET_GLOBAL_CONFIG) {storedFlags=new DataView(payload.buffer).getUint32(8,true);dirty=1;}
      if(id === COMMAND.SAVE_CONFIG) {dirty=0;return {payload:new Uint8Array(16)}}
      const info=new Uint8Array(56); info[7]=dirty; info[55]=3; new DataView(info.buffer).setUint32(24,storedFlags,true); return {payload:info};
    };
    pollAnalogSnapshot=async () => {}; setAdcBits(14);`);
  assert.equal(run('canSave.value'), false);
  assert.equal(await run('applyDraft()'), true);
  assert.equal(run('canSave.value'), true);
  assert.equal(await run('saveConfig()'), true);
  assert.equal(run('savedGlobalBaseline.value.feature_flags'), 6);
  assert.equal(run('configInfo.value.adc_bits'), 14);
  assert.equal(run('canSave.value'), false);
  run('setAdcBits(8); restoreLocalBaselines()');
  assert.equal(run('adcBits.value'), 14);
});

test('automatic calibration cannot capture with unapplied directions', async () => {
  const run = harness();
  run('connected.value = true; page.value = "configurator"; setAnalogDirection({channel:1,inverted:true}); page.value = "calibration"; calibrationSection.value = "automatic"; wizardStep.value = "neutral"; let captures = 0; loadAllProfiles = async () => {captures++; return []}; startCenterCapture = async () => {captures++}');
  await run('wizardPrimary()');
  assert.equal(run('captures'), 0);
  assert.match(run('wizardError.value'), /Apply hardware directions/);
  run('calibrationBackup.value = clone(calibrationDraft.value)');
  await run('wizardPrimary()');
  assert.equal(run('captures'), 2);
});

test('quick calibration starts and captures its center window through the actual App handlers', async () => {
  const timers = [];
  const run = harness({ timers });
  run(`connected.value = true; page.value = "calibration"; wizardStep.value = "neutral";
    loadAllProfiles = async () => Array.from({length:4}, () => clone(profileBackup.value));
    let rawSequence = 0;
    getRaw = async () => ({sequence:++rawSequence, adc:[2048,2050,2046,2044,200,200], buttons:0});`);
  await run('wizardPrimary()');
  assert.equal(run('wizardError.value'), '');
  assert.equal(run('centerCaptureActive.value'), true);
  assert.equal(run('centerCaptureStatus.value.completed'), 0);
  // Five settling samples, then sixteen unique samples at rest.
  for (let sample = 0; sample < 21; sample += 1) {
    assert.equal(timers.length, 1);
    await timers.shift()();
    assert.equal(run('wizardError.value'), '');
  }
  assert.equal(run('wizardStep.value'), 'sticks-range');
  assert.equal(run('centerCaptureActive.value'), false);
  assert.equal(run('rangeCaptureActive.value'), true);
  assert.equal(run('centerCaptureStatus.value.completed'), 1);
  assert.deepEqual(Array.from(run('neutralResult.value.axes.map(axis => axis.center)')), [2048,2050,2046,2044]);
  run('stopRangeTimer()');
});

test('failed center startup clears the listening state and permits retry in both modes', async () => {
  for (const mode of ['quick', 'standard']) {
    const run = harness();
    run(`connected.value = true; wizardStep.value = "neutral";
      calibrationMode.value = "${mode}";
      loadAllProfiles = async () => Array.from({length:4}, () => clone(profileBackup.value));
      const originalSyncStatus = syncCenterCaptureStatus;
      syncCenterCaptureStatus = () => {throw new Error("Center startup failed")};`);
    await run('wizardPrimary()');
    assert.equal(run('wizardError.value'), 'Center startup failed');
    assert.equal(run('centerCaptureActive.value'), false);
    assert.equal(run('centerCaptureStatus.value.phase'), 'idle');
    assert.equal(run('centerReturnCapture'), null);
    run('syncCenterCaptureStatus = originalSyncStatus');
    await run('wizardPrimary()');
    assert.equal(run('wizardError.value'), '');
    assert.equal(run('centerCaptureActive.value'), true);
    assert.equal(run('centerCaptureStatus.value.mode'), mode);
    assert.equal(run('centerCaptureStatus.value.completed'), 0);
    run('stopCenterTimer()');
  }
});

test('calibration write uses the connected payload version and carries direction once', async () => {
  const run = harness();
  run('let submittedVersion; let submittedBytes; writeChunked = async (begin,set,commit,bytes,version) => {submittedVersion = version[0]; submittedBytes = bytes; return {payload:new Uint8Array(56)}}');
  run('setAnalogDirection({channel:3,inverted:true}); setAnalogDirection({channel:5,inverted:true})');
  await run('writeCalibration()');
  assert.equal(run('submittedVersion'), 2);
  assert.equal(run('submittedBytes[108]'), 40);
  assert.equal(run('calibrationBackup.value.direction_mask'), 40);
  assert.equal(run('calibrationChanged.value'), false);
  run('calibrationDraft.value.calibration_version = 1; calibrationDraft.value.direction_mask = 0; calibrationDraft.value.trigger[1] = clone(defaultCalibration.trigger[1]); calibrationDraft.value.raw[108] = 0x5a');
  await run('writeCalibration()');
  assert.equal(run('submittedVersion'), 1);
  assert.equal(run('submittedBytes[108]'), 0x5a);
  assert.equal(run('calibrationBackup.value.calibration_version'), 1);
});

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
  assert.equal(run('settingsActionState.value.disabled'), false);
  run('setCalibrationBound({kind:"trigger",index:0,field:"raw_released",value:NaN})');
  assert.equal(run('canApply.value'), false);
  run('calibrationDraft.value = clone(defaultCalibration); calibrationSection.value = "automatic"; wizardStep.value = "sticks-range"; profileDraft.value.pollrate_hz = 8000');
  assert.equal(run('canApply.value'), false);
  assert.equal(run('settingsActionState.value.disabled'), true);
});

test('shared settings action is blocked during save; a second Save cannot start', async () => {
  const run = harness();
  run('connected.value = true; configInfo.value = {dirty:true, boot_profile:0}; let releaseCommand; let commands = 0; command = () => {commands++; return new Promise(resolve => {releaseCommand = resolve})}');
  const saving = run('saveConfig()');
  assert.equal(run('canSave.value'), false);
  assert.equal(run('settingsActionState.value.disabled'), true);
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

test('shape edits during Apply survive and remain unapplied', async () => {
  const run = harness();
  run(`connected.value = true; configInfo.value = {dirty:false,boot_profile:0};
    setStickShape({stickIndex:0,sector:0,scaleQ15:28000});
    let releaseProfile; let submittedProfile;
    writeProfileValue = value => { submittedProfile = clone(value); return new Promise(resolve => {releaseProfile = resolve;}); };
    pollAnalogSnapshot = async () => {};`);
  const applying = run('applyDraft()');
  run('setStickShape({stickIndex:0,sector:0,scaleQ15:24000}); releaseProfile(submittedProfile)');
  await applying;
  assert.equal(run('profileDraft.value.stick_shape[0].scale_q15[0]'), 24000);
  assert.equal(run('profileBackup.value.stick_shape[0].scale_q15[0]'), 28000);
  assert.equal(run('profileChanged.value'), true);
});

test('physical calibration edits during a write survive and remain unapplied', async () => {
  const run = harness();
  run(`let releaseCalibration; let submittedCalibration;
    writeCalibrationValue = value => {submittedCalibration = clone(value); return new Promise(resolve => {releaseCalibration = resolve;});};
    calibrationDraft.value.stick[0].radius_q15[0] = 30000;`);
  const writing = run('writeCalibration()');
  run('calibrationDraft.value.stick[0].radius_q15[0] = 29000; releaseCalibration(submittedCalibration)');
  await writing;
  assert.equal(run('calibrationDraft.value.stick[0].radius_q15[0]'), 29000);
  assert.equal(run('calibrationBackup.value.stick[0].radius_q15[0]'), 30000);
  assert.equal(run('calibrationChanged.value'), true);
});

test('shape edits during Save remain drafts and do not enter the saved baseline', async () => {
  const run = harness();
  run(`connected.value = true; configInfo.value = {dirty:true,boot_profile:0};
    profileDraft.value.stick_shape[0].scale_q15[0] = 28000;
    profileBackup.value = clone(profileDraft.value);
    let releaseSave;
    command = id => id === COMMAND.SAVE_CONFIG
      ? new Promise(resolve => {releaseSave = resolve;})
      : Promise.resolve({payload:new Uint8Array(56)});`);
  const saving = run('saveConfig()');
  run('setStickShape({stickIndex:0,sector:0,scaleQ15:24000}); releaseSave({payload:new Uint8Array(16)})');
  assert.equal(await saving, true);
  assert.equal(run('profileDraft.value.stick_shape[0].scale_q15[0]'), 24000);
  assert.equal(run('savedProfileBaseline.value.stick_shape[0].scale_q15[0]'), 28000);
  assert.equal(run('profileChanged.value'), true);
});

test('normal shape Apply serializes the submitted sectors and clears the draft', async () => {
  const run = harness();
  run(`connected.value = true;
    setStickShape({stickIndex:0,sector:0,scaleQ15:28000});
    let transmitted;
    writeChunked = async (begin, set, commit, bytes) => {
      transmitted = new Uint8Array(bytes);
      const payload = new Uint8Array(56); payload[7] = 1;
      return {payload};
    };`);
  await run('writeProfile()');
  assert.equal(run('parseProfile(transmitted, 0).stick_shape[0].scale_q15[0]'), 28000);
  assert.equal(run('profileDraft.value.stick_shape[0].scale_q15[0]'), 28000);
  assert.equal(run('profileChanged.value'), false);
  assert.equal(run('canSave.value'), true);
});

test('shape edits during color Apply are not marked as applied', async () => {
  const run = harness();
  run(`profileDraft.value.color_rgb = [10,20,30];
    let releaseColor;
    command = () => new Promise(resolve => {releaseColor = resolve;});`);
  const applying = run('writeProfileColor()');
  run(`setStickShape({stickIndex:0,sector:0,scaleQ15:24000});
    const payload = new Uint8Array(56); payload[7] = 1; releaseColor({payload});`);
  await applying;
  assert.equal(run('profileDraft.value.stick_shape[0].scale_q15[0]'), 24000);
  assert.equal(run('profileBackup.value.stick_shape[0].scale_q15[0]'), 32768);
  assert.equal(run('profileBackup.value.color_rgb.join(",")'), '10,20,30');
  assert.equal(run('profileChanged.value'), true);
});


test('header and footer follow draft, applied, edited-again and saved states', () => {
  const run = harness();
  run('connected.value = true; page.value = "configurator"; configInfo.value = {dirty:false,boot_profile:0}; setStickShape({stickIndex:0,sector:0,scaleQ15:28000})');
  assert.equal(run('settingsFooterVisible.value'), true);
  assert.equal(run('settingsActionState.value === headerState.value'), true);
  assert.equal(run('settingsActionState.value.action'), 'apply');
  run('profileBackup.value = clone(profileDraft.value); configInfo.value.dirty = true');
  assert.equal(run('settingsActionState.value.action'), 'save');
  assert.equal(run('canSave.value'), true);
  run('setStickShape({stickIndex:0,sector:1,scaleQ15:28000})');
  assert.equal(run('settingsActionState.value.action'), 'apply');
  assert.equal(run('canSave.value'), false);
  run('profileBackup.value = clone(profileDraft.value); configInfo.value.dirty = false');
  assert.equal(run('settingsActionState.value.label'), 'Saved');
  assert.equal(run('settingsActionState.value.disabled'), true);
  run('page.value = "home"');
  assert.equal(run('settingsFooterVisible.value'), true);
  run('page.value = "diagnostics"');
  assert.equal(run('settingsFooterVisible.value'), true);
  run('page.value = "firmware"');
  assert.equal(run('settingsFooterVisible.value'), true);
  run('iapMode.value = true');
  assert.equal(run('settingsFooterVisible.value'), false);
  run('iapMode.value = false');
  run('page.value = "calibration"; calibrationSection.value = "automatic"; calibrationDraft.value.axis[0].raw_min = 10; configInfo.value.dirty = true');
  assert.equal(run('headerState.value.action'), null);
  assert.equal(run('canSave.value'), false);
  run('calibrationSection.value = "manual"');
  assert.equal(run('settingsFooterVisible.value'), true);
  assert.equal(run('settingsActionState.value.action'), 'apply');
  run('connected.value = false');
  assert.equal(run('headerState.value.action'), 'connect');
  assert.equal(run('settingsActionState.value.action'), null);
  assert.equal(run('settingsActionState.value.disabled'), true);
});


test('automatic calibration Apply verifies runtime and profiles before footer Save, without duplicate writes', async () => {
  const run = harness();
  run(`connected.value = true; page.value = "calibration"; wizardStep.value = "validate-calibration";
    configInfo.value = {dirty:false,boot_profile:0,feature_flags:0};
    calibrationDraft.value.axis[0].raw_min = 10;
    calibrationProfileGuard.value = profileResponseSignature([profileBackup.value]);
    loadAllProfiles = async () => [profileBackup.value];
    let reads = 0; readAnalogSnapshot = async () => ({runtime_generation:++reads, adc_running:true});
    let finishWrite; let writes = 0;
    writeCalibrationValue = value => {writes++; return new Promise(resolve => {finishWrite = () => {configInfo.value.dirty=true; resolve(clone(value))}})};
    command = async id => ({payload: new Uint8Array(id === COMMAND.SAVE_CONFIG ? 16 : 56)});`);
  assert.equal(run('settingsFooterVisible.value'), false);
  assert.equal(run('automaticCalibrationPage.value'), true);
  const applying = run('wizardPrimary()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run('wizardActionInProgress.value'), true);
  await run('wizardPrimary()');
  assert.equal(run('writes'), 1);
  assert.equal(run('wizardStep.value'), 'validate-calibration');
  run('finishWrite()');
  await applying;
  assert.equal(run('wizardActionInProgress.value'), false);
  assert.equal(run('wizardError.value'), '');
  assert.equal(run('wizardStep.value'), 'save');
  assert.equal(run('calibrationChanged.value'), false);
  await run('wizardPrimary()');
  assert.equal(run('wizardStep.value'), 'complete');
  assert.equal(run('configInfo.value.dirty'), 0);
  await run('wizardPrimary()');
  assert.equal(run('writes'), 1);
});

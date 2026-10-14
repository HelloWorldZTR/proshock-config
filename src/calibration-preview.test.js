import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@vue/compiler-sfc';
import { computed, reactive, ref } from 'vue';
import { CENTER_RETURN_DIRECTIONS, WIZARD_STEPS, calibrationSteps } from './calibration.js';

/** @brief Exercise the actual preview handlers without a controller or DOM. */
function componentState(file, input) {
  const { descriptor } = parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
  const source = descriptor.scriptSetup.content.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, '');
  const props = reactive(input);
  const events = [];
  const context = vm.createContext({ computed, reactive, ref, CENTER_RETURN_DIRECTIONS, WIZARD_STEPS, calibrationSteps,
    defineProps: () => props, defineEmits: () => (...args) => events.push(args) });
  vm.runInContext(source, context);
  return { props, events, run: code => vm.runInContext(code, context) };
}

test('only debug views can select stages and preview actions never reach the live transaction', () => {
  const { props, events, run } = componentState('./pages/QuickCalibrationPage.vue', {
    step: 'neutral', developmentPreview: false, calibrationMode: 'quick',
  });
  run('choosePreviewStep("save")');
  assert.equal(run('displayedStep.value'), 'neutral');
  props.developmentPreview = true;
  for (const step of WIZARD_STEPS.filter(step => step !== 'backup')) {
    run(`choosePreviewStep(${JSON.stringify(step)}); handlePrimary()`);
    assert.equal(run('displayedStep.value'), step);
    assert.equal(props.step, 'neutral');
  }
  assert.deepEqual(events, []);
  run('handleBack(); handleMode("standard")');
  assert.equal(run('displayedStep.value'), 'save');
  assert.equal(props.calibrationMode, 'quick');
  run('choosePreviewStep("invalid")');
  assert.equal(run('displayedStep.value'), 'save');
  props.developmentPreview = false;
  assert.equal(run('previewActive.value'), false);
  assert.equal(run('displayedStep.value'), 'neutral');
  props.developmentPreview = true;
  run('handleCancel()');
  assert.equal(run('previewActive.value'), false);
  assert.deepEqual(events, []);
  run('handlePrimary()');
  assert.deepEqual(events, [['primary']]);
});

test('preview Apply and Save are disabled even with a connected controller and valid calibration', () => {
  const { props, run } = componentState('./CalibrationWizard.vue', {
    step: 'validate-calibration', preview: true, offline: false, busy: false,
    calibrationValid: true, calibrationMode: 'quick',
  });
  assert.equal(run('footerState.value.label'), 'Apply');
  assert.equal(run('footerState.value.disabled'), true);
  props.step = 'save';
  assert.equal(run('footerState.value.label'), 'Save');
  assert.equal(run('footerState.value.disabled'), true);
  props.preview = false;
  assert.equal(run('footerState.value.disabled'), false);
  props.step = 'complete';
  assert.equal(run('footerState.value.disabled'), true);
  assert.equal(run('progress.value'), 100);
});

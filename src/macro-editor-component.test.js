import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import * as schema from "./resolver-schema.js";
import * as editor from "./macro-editor.js";
import * as capture from "./macro-capture.js";
import * as combo from "./combo-capture.js";

// Exercise the real setup script with Vue reactivity; browser QA covers its template/layout.
const source = fs.readFileSync(new URL("./components/ResolverEditor.vue", import.meta.url), "utf8")
  .split("<script setup>")[1].split("</script>")[0].replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");

/** @brief Run actual component handlers with deterministic time and no USB side effects. */
function harness(connected = true) {
  const props = reactive({ connected, resolver: schema.createDefaultResolver(), raw: { buttons: 0, dpad_hat: 8 } });
  let now = 0;
  const timers = new Map();
  let timerId = 0;
  let teardown;
  const context = vm.createContext({
    ...schema, ...editor, ...capture, ...combo,
    computed, ref, watch, nextTick, onBeforeUnmount: (fn) => { teardown = fn; },
    defineProps: () => props,
    defineEmits: () => (name, value) => { if (name === "update") props.resolver = value; },
    document: { activeElement: null },
    performance: { now: () => now },
    window: {
      setInterval: (fn) => { timers.set(++timerId, fn); return timerId; },
      clearInterval: (id) => timers.delete(id),
    },
  });
  const scope = effectScope();
  const api = scope.run(() => vm.runInContext(source + `\n({ openMacroRecorder, closeMacroRecorder, startMacroRecording, stopMacroRecording,
    saveMacroRecording, updateRecordedStepDuration, recorderMode, recorderLoop, recorderHoldLast,
    recordedSteps, recorderError, recordingNotice, isRecording, recorderStartMode })`, context));
  return { api, props, timers, teardown: () => { teardown(); scope.stop(); }, time: (value) => { now = value; }, tick: () => [...timers.values()].forEach((fn) => fn()) };
}

test("component preserves playback flags when only timing changes and discards cancelled edits", async () => {
  const h = harness(false);
  h.props.resolver.macros.push({ mode: 2, loop: true, hold_last: true, steps: [{ output_mask: 2, duration_4ms: 25 }] });
  await h.api.openMacroRecorder(0);
  h.api.updateRecordedStepDuration(0, { target: { value: "6" } });
  h.api.saveMacroRecording();
  assert.deepEqual(JSON.parse(JSON.stringify(h.props.resolver.macros[0])), {
    mode: 2, loop: true, hold_last: true, steps: [{ output_mask: 2, duration_4ms: 2 }],
  });
  await h.api.openMacroRecorder(0);
  h.api.updateRecordedStepDuration(0, { target: { value: "" } });
  h.api.saveMacroRecording();
  assert.match(h.api.recorderError.value, /Step 1/);
  h.api.closeMacroRecorder();
  assert.equal(h.props.resolver.macros[0].steps[0].duration_4ms, 2);
  h.teardown();
});

test("component stops on disconnect and releases timers on stop, restart, close and unmount", async () => {
  const h = harness();
  await h.api.openMacroRecorder(0);
  h.api.startMacroRecording();
  h.api.startMacroRecording();
  assert.equal(h.timers.size, 1);
  h.time(100);
  h.props.connected = false;
  await nextTick();
  assert.equal(h.api.isRecording.value, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.api.recordedSteps.value[0].duration_4ms, 25);
  assert.match(h.api.recordingNotice.value, /disconnected/);
  h.api.startMacroRecording();
  assert.equal(h.timers.size, 0);
  h.props.connected = true;
  await nextTick();
  h.api.recorderStartMode.value = "first-input";
  h.api.startMacroRecording();
  h.api.stopMacroRecording();
  assert.equal(h.api.recordedSteps.value.length, 0);
  assert.equal(h.timers.size, 0);
  h.api.startMacroRecording();
  h.api.closeMacroRecorder();
  assert.equal(h.timers.size, 0);
  await h.api.openMacroRecorder(0);
  h.api.startMacroRecording();
  h.teardown();
  assert.equal(h.timers.size, 0);
});

test("component timer ends a long hold at the shared capacity", async () => {
  const h = harness();
  await h.api.openMacroRecorder(0);
  h.api.startMacroRecording();
  h.time(20000);
  h.tick();
  assert.equal(h.api.recordedSteps.value.length, 10);
  assert.equal(h.api.isRecording.value, false);
  assert.equal(h.timers.size, 0);
  assert.match(h.api.recordingNotice.value, /truncated/);
  h.teardown();
});

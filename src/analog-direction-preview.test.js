import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { computed, reactive } from "vue";
import { parse } from "@vue/compiler-sfc";
import { createDefaultAnalogCalibration } from "./protocol.js";
import { analogAxisInvert, changeAnalogDirection } from "./analog-direction.js";
import { normalizeAxis, normalizedTrigger } from "./calibration.js";

const { descriptor } = parse(fs.readFileSync(new URL("./components/AnalogDirectionEditor.vue", import.meta.url), "utf8"));
const source = descriptor.scriptSetup.content.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");

/** @brief Exercise real viewer wiring with conflicting raw and processed inputs. */
function previewHarness() {
  const props = reactive({
    calibration: createDefaultAnalogCalibration(),
    raw: { adc: [4085, 2048, 5, 2048, 4085, 5] },
    snapshot: { output_stick_q15: [-32767, 32767, 32767, -32767], output_trigger_q15: [0, 32767] },
  });
  const context = vm.createContext({ computed, normalizeAxis, normalizedTrigger, analogAxisInvert, defineProps: () => props, defineEmits: () => {} });
  vm.runInContext(source, context);
  return { props, read: (code) => vm.runInContext(code, context) };
}

test("direction viewers use raw ADC with draft signs and ignore processed firmware output", () => {
  const { props, read } = previewHarness();
  assert.equal(read("stickValues.value[0]"), 1);
  assert.equal(read("stickValues.value[2]"), -1);
  assert.equal(read("triggerPoints.value[0].percent"), 100);
  assert.equal(read("triggerPoints.value[1].percent"), 0);
  props.calibration = changeAnalogDirection(props.calibration, 0, true);
  props.calibration = changeAnalogDirection(props.calibration, 4, true);
  assert.equal(read("stickValues.value[0]"), -1);
  assert.equal(read("triggerPoints.value[0].percent"), 0);
  assert.equal(props.raw.adc[0], 4085);
  assert.equal(props.raw.adc[4], 4085);
  props.snapshot.output_stick_q15[0] = 12345;
  props.snapshot.output_trigger_q15[0] = 12345;
  assert.equal(read("stickValues.value[0]"), -1);
  assert.equal(read("triggerPoints.value[0].percent"), 0);
});

test("direction viewers distinguish missing ADC telemetry from center and release", () => {
  const { props, read } = previewHarness();
  props.raw = null;
  assert.equal(read("hasStickData.value"), false);
  assert.equal(read("triggerPoints.value[0].percent"), null);
  props.raw = { adc: [2048, 2048, 2048, 2048, 5, 5] };
  assert.equal(read("hasStickData.value"), true);
  assert.equal(read("stickValues.value[0]"), 0);
  assert.equal(read("triggerPoints.value[0].percent"), 0);
});

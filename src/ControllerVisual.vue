<template>
  <div class="controller-visual">
    <div ref="svgHost" class="controller-svg" v-html="controllerSvg"></div>
    <div v-if="showStickReadouts" class="stick-readouts">
      <span>LX {{ stickLabel(leftX) }}</span>
      <span>LY {{ stickLabel(leftY) }}</span>
      <span>RX {{ stickLabel(rightX) }}</span>
      <span>RY {{ stickLabel(rightY) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import controllerSvg from "./assets/dualshock-controller.svg?raw";

const props = defineProps({
  stickValues: {
    type: Array,
    required: true,
  },
  triggerValues: {
    type: Array,
    required: true,
  },
  buttons: {
    type: Number,
    default: 0,
  },
  dpadHat: {
    type: Number,
    default: 8,
  },
  showStickReadouts: {
    type: Boolean,
    default: true,
  },
});

const svgHost = ref(null);
const ACTIVE_COLOR = "#55d6ff";
const INACTIVE_CONTROL_COLOR = "#dbeafe";

const leftX = computed(() => props.stickValues[0] || 0);
const leftY = computed(() => props.stickValues[1] || 0);
const rightX = computed(() => props.stickValues[2] || 0);
const rightY = computed(() => props.stickValues[3] || 0);
const leftTrigger = computed(() => Math.round((props.triggerValues[0] || 0) * 100));
const rightTrigger = computed(() => Math.round((props.triggerValues[1] || 0) * 100));

function stickLabel(value) {
  return value.toFixed(2);
}

function setStyle(id, style) {
  const el = svgHost.value?.querySelector(`#${id}`);
  if (el) {
    Object.entries(style).forEach(([key, value]) => {
      el.style[key] = value;
    });
  }
}

function setText(id, value, visible) {
  const el = svgHost.value?.querySelector(`#${id}`);
  if (!el) {
    return;
  }
  el.textContent = value;
  el.style.opacity = visible ? "1" : "0";
}

function mixTriggerColor(percent) {
  const start = [219, 234, 254];
  const end = [85, 214, 255];
  const amount = Math.max(0, Math.min(1, percent / 100));
  const mixed = start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * amount));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function paintStaticController() {
  const bodyFill = "#f8fafc";
  const buttonFill = INACTIVE_CONTROL_COLOR;
  const outline = "#1e293b";

  ["Controller_infills", "L3_infill", "R3_infill", "Trackpad_infill"].forEach((id) => {
    setStyle(id, { fill: bodyFill });
  });
  [
    "Button_infills",
    "Up_infill",
    "Down_infill",
    "Left_infill",
    "Right_infill",
    "Square_infill",
    "Cross_infill",
    "Circle_infill",
    "Triangle_infill",
    "L1_infill",
    "R1_infill",
    "L2_infill",
    "R2_infill",
    "Create_infill",
    "Options_infill",
    "PS_infill",
  ].forEach((id) => {
    setStyle(id, { fill: buttonFill });
  });
  ["Outline", "Button_outlines", "Button_outlines_behind", "Trackpad_outline"].forEach((id) => {
    setStyle(id, { fill: outline });
  });
  ["L3_outline", "R3_outline", "L3_outline_", "R3_outline_"].forEach((id) => {
    setStyle(id, { fill: outline });
  });
  setStyle("L3_infill", { fill: INACTIVE_CONTROL_COLOR });
  setStyle("R3_infill", { fill: INACTIVE_CONTROL_COLOR });
}

function buttonPressed(bit) {
  return (props.buttons & (1 << bit)) !== 0;
}

function setButton(id, active) {
  setStyle(`${id}_infill`, {
    fill: active ? ACTIVE_COLOR : INACTIVE_CONTROL_COLOR,
  });
}

function updateButtons() {
  setButton("Square", buttonPressed(0));
  setButton("Cross", buttonPressed(1));
  setButton("Circle", buttonPressed(2));
  setButton("Triangle", buttonPressed(3));
  setButton("L1", buttonPressed(4));
  setButton("R1", buttonPressed(5));
  setButton("L2", buttonPressed(6) || leftTrigger.value > 12);
  setButton("R2", buttonPressed(7) || rightTrigger.value > 12);
  setButton("Create", buttonPressed(8));
  setButton("Options", buttonPressed(9));
  setButton("L3", buttonPressed(10));
  setButton("R3", buttonPressed(11));
  setButton("PS", buttonPressed(12));
  setButton("Trackpad", buttonPressed(13));

  setButton("Up", props.dpadHat === 0 || props.dpadHat === 1 || props.dpadHat === 7);
  setButton("Right", props.dpadHat === 1 || props.dpadHat === 2 || props.dpadHat === 3);
  setButton("Down", props.dpadHat === 3 || props.dpadHat === 4 || props.dpadHat === 5);
  setButton("Left", props.dpadHat === 5 || props.dpadHat === 6 || props.dpadHat === 7);
}

function updateStick(id, x, y, pressed) {
  const stick = svgHost.value?.querySelector(`#${id}`);
  const magnitude = Math.min(1, Math.hypot(x, y));
  const moving = magnitude > 0.04;
  const maxOffset = 20;

  if (!stick) {
    return;
  }

  stick.setAttribute("transform", `translate(${x * maxOffset}, ${y * maxOffset})`);
  stick.style.filter = moving
    ? `drop-shadow(${x * 8}px ${y * 8}px ${4 + magnitude * 4}px rgba(85, 214, 255, ${0.22 + magnitude * 0.28}))`
    : "none";
  setStyle(`${id}_infill`, {
    fill: moving || pressed ? ACTIVE_COLOR : INACTIVE_CONTROL_COLOR,
  });
}

function updateController() {
  if (!svgHost.value) {
    return;
  }

  updateButtons();
  updateStick("L3", leftX.value, leftY.value, buttonPressed(10));
  updateStick("R3", rightX.value, rightY.value, buttonPressed(11));

  setStyle("L2_infill", { fill: mixTriggerColor(leftTrigger.value) });
  setStyle("R2_infill", { fill: mixTriggerColor(rightTrigger.value) });
  setText("L2_percentage", `${leftTrigger.value} %`, leftTrigger.value > 2);
  setText("R2_percentage", `${rightTrigger.value} %`, rightTrigger.value > 2);
}

onMounted(async () => {
  await nextTick();
  paintStaticController();
  updateController();
});

watch(() => props.stickValues, updateController, { deep: true });
watch(() => props.triggerValues, updateController, { deep: true });
watch(() => props.buttons, updateController);
watch(() => props.dpadHat, updateController);
</script>

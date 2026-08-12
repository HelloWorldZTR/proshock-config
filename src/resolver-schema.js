export const RESOLVER_VERSION = 1;
export const RESOLVER_OFFSET = 104;
export const RESOLVER_SIZE = 148;
export const SOURCE_COUNT = 28;
export const CONNECTED_SOURCE_COUNT = 26;
export const OUTPUT_COUNT = 18;
export const LAYER_COUNT = 2;
export const LAYER_OVERRIDE_LIMIT = 8;
export const COMBO_LIMIT = 4;
export const MACRO_LIMIT = 4;
export const MACRO_STEP_LIMIT = 10;

export const SOURCE_NAMES = [
  "Square", "Cross", "Circle", "Triangle", "L1", "R1", "L2", "R2",
  "Share", "Options", "L3", "R3", "PS", "Trackpad", "D-pad Up",
  "D-pad Right", "D-pad Down", "D-pad Left", "K1", "K2", "K3", "K4",
  "K5", "K6", "K7", "K8", "K9", "K10",
];

export const SOURCE_GROUPS = [
  { id: "face", label: "Face", sources: [0, 1, 2, 3] },
  { id: "shoulder", label: "Shoulder", sources: [4, 5, 6, 7] },
  { id: "system", label: "System", sources: [8, 9, 10, 11, 12, 13] },
  { id: "dpad", label: "D-pad", sources: [14, 15, 16, 17] },
  { id: "custom", label: "Custom", sources: [18, 19, 20, 21, 22, 23, 24, 25] },
  { id: "reserved", label: "Reserved", sources: [26, 27] },
];

export const GPIO_NAMES = {
  18: "PA11", 19: "PA10", 20: "PA9", 21: "PA8",
  22: "PC9", 23: "PC8", 24: "PC7", 25: "PC6",
};

export const ACTION = {
  NONE: 0x00,
  GAMEPAD_FIRST: 0x01,
  MACRO_FIRST: 0x20,
  LAYER_1_MOMENTARY: 0x30,
  LAYER_2_MOMENTARY: 0x31,
  LAYER_1_TOGGLE: 0x32,
  LAYER_2_TOGGLE: 0x33,
  LAYER_CLEAR: 0x34,
  PROFILE_FIRST: 0x40,
  PROFILE_NEXT: 0x44,
  PROFILE_PREVIOUS: 0x45,
};

export const ACTION_OPTIONS = [
  { id: 0x00, family: "None", label: "None" },
  ...SOURCE_NAMES.slice(0, OUTPUT_COUNT).map((label, index) => ({
    id: 0x01 + index, family: "Gamepad", label,
  })),
  ...Array.from({ length: MACRO_LIMIT }, (_, index) => ({
    id: 0x20 + index, family: "Macro", label: `Macro ${index + 1}`,
  })),
  { id: 0x30, family: "Layer", label: "Layer 1 · Momentary" },
  { id: 0x31, family: "Layer", label: "Layer 2 · Momentary" },
  { id: 0x32, family: "Layer", label: "Layer 1 · Toggle" },
  { id: 0x33, family: "Layer", label: "Layer 2 · Toggle" },
  { id: 0x34, family: "Layer", label: "Clear toggled layers" },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: 0x40 + index, family: "Profile", label: `Switch to Slot ${index + 1}`,
  })),
  { id: 0x44, family: "Profile", label: "Next profile" },
  { id: 0x45, family: "Profile", label: "Previous profile" },
];

export const MACRO_MODES = [
  { id: 0, label: "Once" },
  { id: 1, label: "While held" },
  { id: 2, label: "Toggle" },
];

export function actionLabel(actionId) {
  return ACTION_OPTIONS.find((action) => action.id === actionId)?.label
    || `Unknown 0x${actionId.toString(16).padStart(2, "0")}`;
}

export function createDefaultResolver() {
  return {
    resolver_version: RESOLVER_VERSION,
    flags: 0,
    analog_route: 0,
    layer_count: 0,
    base_mapping: Array.from(
      { length: SOURCE_COUNT },
      (_, index) => index < OUTPUT_COUNT ? ACTION.GAMEPAD_FIRST + index : ACTION.NONE,
    ),
    layers: Array.from({ length: LAYER_COUNT }, () => ({ overrides: [] })),
    combos: [],
    macros: [],
    reserved: new Uint8Array(8),
  };
}

function readStepMask(payload, offset) {
  return payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16);
}

export function parseResolver(payload, baseOffset = RESOLVER_OFFSET) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const resolver = {
    resolver_version: payload[baseOffset],
    flags: payload[baseOffset + 1],
    analog_route: payload[baseOffset + 2],
    layer_count: payload[baseOffset + 3],
    layer_override_count: payload[baseOffset + 4],
    combo_count: payload[baseOffset + 5],
    macro_count: payload[baseOffset + 6],
    macro_step_count: payload[baseOffset + 7],
    base_mapping: Array.from(
      { length: SOURCE_COUNT },
      (_, index) => payload[baseOffset + 8 + index],
    ),
    layers: [],
    combos: [],
    macros: [],
    reserved: payload.slice(baseOffset + 140, baseOffset + RESOLVER_SIZE),
  };
  const layerCount = payload[baseOffset + 3];
  const comboCount = payload[baseOffset + 5];
  const macroCount = payload[baseOffset + 6];
  for (let index = 0; index < LAYER_COUNT; index += 1) {
    const descriptor = baseOffset + 36 + index * 4;
    const offset = payload[descriptor];
    const count = index < layerCount ? payload[descriptor + 1] : 0;
    resolver.layers.push({
      flags: payload[descriptor + 2],
      reserved: payload[descriptor + 3],
      overrides: Array.from({ length: count }, (_, entryIndex) => {
        const entry = baseOffset + 44 + (offset + entryIndex) * 2;
        return { source_id: payload[entry], action_id: payload[entry + 1] };
      }),
    });
  }
  for (let index = 0; index < comboCount; index += 1) {
    const offset = baseOffset + 60 + index * 6;
    const control = payload[offset + 5];
    resolver.combos.push({
      input_mask: view.getUint32(offset, true),
      action_id: payload[offset + 4],
      leader_source_id: control & 0x1f,
      consume: !!(control & 0x20),
      exact: !!(control & 0x40),
      enabled: !!(control & 0x80),
    });
  }
  for (let index = 0; index < macroCount; index += 1) {
    const descriptor = baseOffset + 84 + index * 4;
    const stepOffset = payload[descriptor];
    const count = payload[descriptor + 1];
    const modeFlags = payload[descriptor + 2];
    resolver.macros.push({
      mode: modeFlags & 0x03,
      loop: !!(modeFlags & 0x04),
      hold_last: !!(modeFlags & 0x08),
      mode_flags_raw: modeFlags,
      reserved: payload[descriptor + 3],
      steps: Array.from({ length: count }, (_, stepIndex) => {
        const offset = baseOffset + 100 + (stepOffset + stepIndex) * 4;
        return {
          output_mask: readStepMask(payload, offset),
          duration_4ms: payload[offset + 3],
        };
      }),
    });
  }
  return resolver;
}

function validAction(resolver, actionId) {
  if (actionId === 0) return true;
  if (actionId >= 0x01 && actionId <= 0x12) return true;
  if (actionId >= 0x20 && actionId <= 0x23) {
    const macro = resolver.macros[actionId - 0x20];
    return !!macro;
  }
  if (actionId >= 0x30 && actionId <= 0x34) return true;
  return actionId >= 0x40 && actionId <= 0x45;
}

function popcount32(value) {
  let remaining = value >>> 0;
  let count = 0;
  while (remaining) {
    remaining = (remaining & (remaining - 1)) >>> 0;
    count += 1;
  }
  return count;
}

export function validateResolver(resolver) {
  const errors = [];
  const systemComboMasks = new Set([
    (1 << 12) | (1 << 14), (1 << 12) | (1 << 15),
    (1 << 12) | (1 << 16), (1 << 12) | (1 << 17),
  ]);
  const overrides = resolver.layers.flatMap((layer) => layer.overrides);
  const steps = resolver.macros.flatMap((macro) => macro.steps);
  if (resolver.resolver_version !== RESOLVER_VERSION) errors.push("Resolver version is unsupported.");
  if (resolver.flags !== 0 || resolver.analog_route !== 0) errors.push("Reserved Resolver flags must remain zero.");
  if (Array.from(resolver.reserved || []).some((value) => value !== 0)) errors.push("Reserved Resolver bytes must remain zero.");
  if (resolver.layer_count != null && resolver.layer_count > LAYER_COUNT) errors.push("Layer count exceeds firmware capacity.");
  if (resolver.layer_override_count != null && resolver.layer_override_count > LAYER_OVERRIDE_LIMIT) errors.push("Layer override count exceeds firmware capacity.");
  if (resolver.combo_count != null && resolver.combo_count > COMBO_LIMIT) errors.push("Combo count exceeds firmware capacity.");
  if (resolver.macro_count != null && resolver.macro_count > MACRO_LIMIT) errors.push("Macro count exceeds firmware capacity.");
  if (resolver.macro_step_count != null && resolver.macro_step_count > MACRO_STEP_LIMIT) errors.push("Macro step count exceeds firmware capacity.");
  if (overrides.length > LAYER_OVERRIDE_LIMIT) errors.push(`Layer overrides use ${overrides.length}/${LAYER_OVERRIDE_LIMIT}.`);
  if (resolver.combos.length > COMBO_LIMIT) errors.push(`Combos use ${resolver.combos.length}/${COMBO_LIMIT}.`);
  if (resolver.macros.length > MACRO_LIMIT) errors.push(`Macros use ${resolver.macros.length}/${MACRO_LIMIT}.`);
  if (steps.length > MACRO_STEP_LIMIT) errors.push(`Macro steps use ${steps.length}/${MACRO_STEP_LIMIT}.`);
  resolver.base_mapping.forEach((actionId, sourceId) => {
    if (!validAction(resolver, actionId)) errors.push(`${SOURCE_NAMES[sourceId]} has an invalid action.`);
    if (sourceId >= CONNECTED_SOURCE_COUNT && actionId !== 0) errors.push(`${SOURCE_NAMES[sourceId]} is reserved.`);
  });
  resolver.layers.forEach((layer, layerIndex) => {
    const seen = new Set();
    if (layerIndex < (resolver.layer_count || 0) && (layer.flags !== 1 || layer.reserved !== 0)) {
      errors.push(`Layer ${layerIndex + 1} has invalid descriptor flags.`);
    }
    layer.overrides.forEach((entry) => {
      if (entry.source_id >= CONNECTED_SOURCE_COUNT) errors.push(`Layer ${layerIndex + 1} uses a reserved source.`);
      if (seen.has(entry.source_id)) errors.push(`Layer ${layerIndex + 1} repeats ${SOURCE_NAMES[entry.source_id]}.`);
      if (!validAction(resolver, entry.action_id)) errors.push(`Layer ${layerIndex + 1} has an invalid action.`);
      seen.add(entry.source_id);
    });
  });
  const comboMasks = new Set();
  resolver.combos.forEach((combo, index) => {
    const validMask = combo.input_mask >>> 0;
    if (!validMask || (validMask & 0xfc000000) !== 0) errors.push(`Combo ${index + 1} has an invalid source mask.`);
    if (popcount32(validMask) < 2) errors.push(`Combo ${index + 1} needs at least two members.`);
    if (!(validMask & (1 << combo.leader_source_id))) errors.push(`Combo ${index + 1} leader is not a member.`);
    if (comboMasks.has(validMask)) errors.push(`Combo ${index + 1} duplicates another chord.`);
    if ([...systemComboMasks].some((mask) => (validMask & mask) === mask)) {
      errors.push(`Combo ${index + 1} is shadowed by a PS + D-pad system shortcut.`);
    }
    resolver.combos.slice(0, index).forEach((other, otherIndex) => {
      const otherMask = other.input_mask >>> 0;
      if (other.leader_source_id === combo.leader_source_id
        && ((otherMask & validMask) === otherMask || (otherMask & validMask) === validMask)) {
        errors.push(`Combo ${index + 1} overlaps Combo ${otherIndex + 1} under the same Leader.`);
      }
    });
    if (!validAction(resolver, combo.action_id)) errors.push(`Combo ${index + 1} has an invalid result.`);
    if (combo.enabled === false) errors.push(`Combo ${index + 1} is missing its enabled flag.`);
    comboMasks.add(validMask);
  });
  resolver.macros.forEach((macro, macroIndex) => {
    if (![0, 1, 2].includes(macro.mode) || !macro.steps.length) errors.push(`Macro ${macroIndex + 1} is incomplete.`);
    if (macro.mode === 0 && macro.hold_last) errors.push(`Macro ${macroIndex + 1} cannot hold forever in Once mode.`);
    if ((macro.mode_flags_raw != null && (macro.mode_flags_raw & ~0x8f) !== 0)
      || macro.reserved) errors.push(`Macro ${macroIndex + 1} has invalid descriptor flags.`);
    if (macro.mode_flags_raw != null && (macro.mode_flags_raw & 0x80) === 0) errors.push(`Macro ${macroIndex + 1} is missing its enabled flag.`);
    macro.steps.forEach((step, stepIndex) => {
      const mask = step.output_mask >>> 0;
      if (!step.duration_4ms || step.duration_4ms > 255) errors.push(`Macro ${macroIndex + 1}, step ${stepIndex + 1} needs 4–1020 ms.`);
      if ((mask & ~0x3ffff) !== 0 || ((mask & (1 << 14)) && (mask & (1 << 16))) || ((mask & (1 << 15)) && (mask & (1 << 17)))) {
        errors.push(`Macro ${macroIndex + 1}, step ${stepIndex + 1} has an invalid output chord.`);
      }
    });
  });
  return errors;
}

export function writeResolver(
  payload,
  resolver,
  baseOffset = RESOLVER_OFFSET,
  { allowReserved = false } = {},
) {
  const errors = validateResolver(resolver).filter((error) => (
    !allowReserved || error !== "Reserved Resolver bytes must remain zero."
  ));
  if (errors.length) throw new Error(errors[0]);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  payload.fill(0, baseOffset, baseOffset + RESOLVER_SIZE);
  const overrides = resolver.layers.flatMap((layer) => layer.overrides);
  const steps = resolver.macros.flatMap((macro) => macro.steps);
  payload[baseOffset] = RESOLVER_VERSION;
  payload[baseOffset + 3] = LAYER_COUNT;
  payload[baseOffset + 4] = overrides.length;
  payload[baseOffset + 5] = resolver.combos.length;
  payload[baseOffset + 6] = resolver.macros.length;
  payload[baseOffset + 7] = steps.length;
  payload.set(resolver.base_mapping, baseOffset + 8);
  let overrideOffset = 0;
  resolver.layers.forEach((layer, index) => {
    const descriptor = baseOffset + 36 + index * 4;
    payload[descriptor] = overrideOffset;
    payload[descriptor + 1] = layer.overrides.length;
    payload[descriptor + 2] = 0x01;
    layer.overrides.forEach((entry) => {
      const offset = baseOffset + 44 + overrideOffset * 2;
      payload[offset] = entry.source_id;
      payload[offset + 1] = entry.action_id;
      overrideOffset += 1;
    });
  });
  resolver.combos.forEach((combo, index) => {
    const offset = baseOffset + 60 + index * 6;
    view.setUint32(offset, combo.input_mask >>> 0, true);
    payload[offset + 4] = combo.action_id;
    payload[offset + 5] = combo.leader_source_id
      | (combo.consume ? 0x20 : 0) | (combo.exact ? 0x40 : 0) | 0x80;
  });
  let stepOffset = 0;
  resolver.macros.forEach((macro, index) => {
    const descriptor = baseOffset + 84 + index * 4;
    payload[descriptor] = stepOffset;
    payload[descriptor + 1] = macro.steps.length;
    payload[descriptor + 2] = macro.mode | (macro.loop ? 0x04 : 0)
      | (macro.hold_last ? 0x08 : 0) | 0x80;
    macro.steps.forEach((step) => {
      const offset = baseOffset + 100 + stepOffset * 4;
      payload[offset] = step.output_mask & 0xff;
      payload[offset + 1] = (step.output_mask >>> 8) & 0xff;
      payload[offset + 2] = (step.output_mask >>> 16) & 0xff;
      payload[offset + 3] = step.duration_4ms;
      stepOffset += 1;
    });
  });
  payload.set(new Uint8Array(resolver.reserved || 8).slice(0, 8), baseOffset + 140);
}

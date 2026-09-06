import { ACTION, MACRO_LIMIT } from "./resolver-schema.js";

/** @brief Copy editable macro data and regenerate derived descriptor flags. */
export function cloneMacroDraft(macro) {
  const draft = {
    mode: 0, loop: false, hold_last: false,
    ...macro,
    steps: (macro?.steps || []).map((step) => ({ ...step })),
  };
  // Raw descriptor flags are derived from the edited fields on serialization.
  delete draft.mode_flags_raw;
  return draft;
}

/** @brief Validate milliseconds and explicitly quantize them to firmware ticks. */
export function parseStepDuration(value) {
  if (String(value).trim() === "") return { error: "Enter a duration from 4 to 1020 ms." };
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 4 || milliseconds > 1020) {
    return { error: "Enter a duration from 4 to 1020 ms." };
  }
  const ticks = Math.round(milliseconds / 4);
  return { ticks, milliseconds: ticks * 4, error: "" };
}

/** @brief Resolve input drafts without leaking temporary editor fields to config. */
export function resolveMacroSteps(steps) {
  const result = [];
  for (const [index, step] of steps.entries()) {
    const duration = parseStepDuration(step.duration_input ?? step.duration_4ms * 4);
    if (duration.error) return { steps: [], error: `Step ${index + 1}: ${duration.error}` };
    result.push({ output_mask: step.output_mask, duration_4ms: duration.ticks });
  }
  return { steps: result, error: "", totalMs: result.reduce((sum, step) => sum + step.duration_4ms * 4, 0) };
}

/** @brief Insert a new or copied step without exceeding the shared pool allowance. */
export function insertMacroStep(steps, index, limit, source = { output_mask: 0, duration_4ms: 25 }) {
  if (steps.length >= limit || index < 0 || index > steps.length) return false;
  steps.splice(index, 0, { ...source });
  return true;
}

/** @brief Move a step and preserve the selected editor's association with its step. */
export function moveMacroStep(steps, from, to, selected) {
  if (from < 0 || to < 0 || from >= steps.length || to >= steps.length) return selected;
  const active = selected === null ? null : steps[selected];
  steps.splice(to, 0, steps.splice(from, 1)[0]);
  return active ? steps.indexOf(active) : null;
}

/** @brief Remove a slot and repair every action reference to subsequent slots. */
export function removeMacroSlot(resolver, index) {
  if (index < 0 || index >= resolver.macros.length) return;
  const removedAction = ACTION.MACRO_FIRST + index;
  const remap = (action) => action === removedAction ? ACTION.NONE
    : action > removedAction && action < ACTION.MACRO_FIRST + MACRO_LIMIT ? action - 1 : action;
  resolver.base_mapping = resolver.base_mapping.map(remap);
  resolver.layers.forEach((layer) => layer.overrides.forEach((entry) => { entry.action_id = remap(entry.action_id); }));
  resolver.combos.forEach((combo) => { combo.action_id = remap(combo.action_id); });
  resolver.macros.splice(index, 1);
}

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

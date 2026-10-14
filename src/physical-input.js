import { digitalMaskFromRawInput } from "./protocol.js";

/** @brief Prefer physical input telemetry; legacy reports cannot identify K1–K8. */
export function physicalPressedSources(raw) {
  const mask = raw?.digital_mask ?? digitalMaskFromRawInput(raw);
  return new Set(Array.from({ length: 26 }, (_, source) => source).filter(source => mask & (1 << source)));
}

import { normalizeAxis } from "./calibration.js";
import {
  ROUNDNESS_Q15_ONE,
  ROUNDNESS_SECTOR_COUNT,
} from "./protocol.js";

export const ROUNDNESS_RADIUS_MIN_Q15 = 27853;
export const ROUNDNESS_RADIUS_MAX_Q15 = 49151;

/**
 * Clamp one firmware roundness boundary to its validated Q1.15 range.
 */
export function clampRoundnessQ15(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return ROUNDNESS_Q15_ONE;
  }
  return Math.max(
    ROUNDNESS_RADIUS_MIN_Q15,
    Math.min(ROUNDNESS_RADIUS_MAX_Q15, Math.round(numeric)),
  );
}

/**
 * Convert a displayed boundary percentage into the firmware Q1.15 value.
 */
export function roundnessPercentToQ15(percent) {
  return clampRoundnessQ15(Number(percent) * ROUNDNESS_Q15_ONE / 100);
}

/**
 * Convert one firmware Q1.15 boundary into a displayed percentage.
 */
export function roundnessQ15ToPercent(value) {
  return clampRoundnessQ15(value) / ROUNDNESS_Q15_ONE * 100;
}

/**
 * Return the firmware sector nearest to one output-coordinate position.
 */
export function roundnessSectorFromPosition(x, y) {
  const numericX = Number(x);
  const numericY = Number(y);
  if (!Number.isFinite(numericX) || !Number.isFinite(numericY)) {
    return 0;
  }
  const turns = Math.atan2(numericY, numericX) / (Math.PI * 2);
  return (
    Math.round(turns * ROUNDNESS_SECTOR_COUNT)
    + ROUNDNESS_SECTOR_COUNT
  ) % ROUNDNESS_SECTOR_COUNT;
}

/**
 * Normalize one live stick into the same flip-aware coordinates as firmware.
 */
export function roundnessEditorStickPosition(raw, calibration, stickIndex) {
  const axisIndex = stickIndex * 2;
  const adc = raw?.adc;
  const axes = calibration?.axis;
  if (!adc || !axes || adc.length < axisIndex + 2 || axes.length < axisIndex + 2) {
    return { x: 0, y: 0, radius: 0, sector: null };
  }
  const x = normalizeAxis(adc[axisIndex], axes[axisIndex], axisIndex);
  const y = normalizeAxis(adc[axisIndex + 1], axes[axisIndex + 1], axisIndex + 1);
  const radius = Math.hypot(x, y);
  return {
    x,
    y,
    radius,
    sector: radius >= 0.2 ? roundnessSectorFromPosition(x, y) : null,
  };
}

/**
 * Build the 16-point SVG boundary polygon stored by firmware.
 */
export function roundnessBoundaryPoints(radiusQ15, scale = 100) {
  return Array.from({ length: ROUNDNESS_SECTOR_COUNT }, (_, sector) => {
    const angle = sector * Math.PI * 2 / ROUNDNESS_SECTOR_COUNT;
    const radius = roundnessQ15ToPercent(radiusQ15?.[sector]) / 100 * scale;
    return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
  }).join(" ");
}

/**
 * Build one full-size SVG pie slice used as the sector hit target.
 */
export function roundnessSectorPath(sector, radius = 150) {
  const halfStep = Math.PI / ROUNDNESS_SECTOR_COUNT;
  const centerAngle = sector * Math.PI * 2 / ROUNDNESS_SECTOR_COUNT;
  const start = centerAngle - halfStep;
  const end = centerAngle + halfStep;
  const x1 = Math.cos(start) * radius;
  const y1 = Math.sin(start) * radius;
  const x2 = Math.cos(end) * radius;
  const y2 = Math.sin(end) * radius;
  return `M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

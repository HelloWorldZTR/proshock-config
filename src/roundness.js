export const ROUNDNESS_TEST_SECTOR_COUNT = 16;
export const ROUNDNESS_TEST_MIN_RADIUS = 0.5;
export const ROUNDNESS_TEST_TOLERANCE = 0.05;

/**
 * Create an empty fixed-size roundness capture.
 *
 * @returns {{radii: number[], sampleCounts: number[], sampleCount: number}}
 */
export function createRoundnessCapture() {
  return {
    radii: Array(ROUNDNESS_TEST_SECTOR_COUNT).fill(0),
    sampleCounts: Array(ROUNDNESS_TEST_SECTOR_COUNT).fill(0),
    sampleCount: 0,
  };
}

/**
 * Record one normalized stick position into its nearest angular sector.
 *
 * @param {{radii: number[], sampleCounts: number[], sampleCount: number}} capture
 * @param {number} x
 * @param {number} y
 * @returns {{radii: number[], sampleCounts: number[], sampleCount: number}}
 */
export function recordRoundnessSample(capture, x, y) {
  const numericX = Number(x);
  const numericY = Number(y);
  const radius = Math.hypot(numericX, numericY);
  if (
    !Number.isFinite(radius)
    || radius < ROUNDNESS_TEST_MIN_RADIUS
  ) {
    return capture;
  }

  const turns = Math.atan2(numericY, numericX) / (Math.PI * 2);
  const sector = (
    Math.round(turns * ROUNDNESS_TEST_SECTOR_COUNT)
    + ROUNDNESS_TEST_SECTOR_COUNT
  ) % ROUNDNESS_TEST_SECTOR_COUNT;
  const radii = [...capture.radii];
  const sampleCounts = [...capture.sampleCounts];
  radii[sector] = Math.max(radii[sector], radius);
  sampleCounts[sector] += 1;
  return {
    radii,
    sampleCounts,
    sampleCount: capture.sampleCount + 1,
  };
}

/**
 * Calculate coverage and full-scale circularity error for one stick.
 *
 * Error is the mean absolute radial deviation from the ideal unit circle.
 *
 * @param {{radii: number[], sampleCounts: number[], sampleCount: number}} capture
 * @returns {{coverage: number, complete: boolean, errorPercent: number|null, minRadius: number|null, maxRadius: number|null}}
 */
export function analyzeRoundnessCapture(capture) {
  const coveredRadii = capture.radii.filter((radius) => radius > 0);
  const coverage = coveredRadii.length;
  const complete = coverage === ROUNDNESS_TEST_SECTOR_COUNT;
  if (!coverage) {
    return {
      coverage,
      complete,
      errorPercent: null,
      minRadius: null,
      maxRadius: null,
    };
  }
  const errorPercent = complete
    ? coveredRadii.reduce((total, radius) => total + Math.abs(radius - 1), 0)
      / coveredRadii.length
      * 100
    : null;
  return {
    coverage,
    complete,
    errorPercent,
    minRadius: Math.min(...coveredRadii),
    maxRadius: Math.max(...coveredRadii),
  };
}

/**
 * Compare a measured trace with the selected per-sector target shape.
 *
 * A covered sector is green when its radial error is within five percent of
 * the target and red when it falls outside that tolerance.
 */
export function analyzeRoundnessAgainstTarget(
  capture,
  targetRadii,
  tolerance = ROUNDNESS_TEST_TOLERANCE,
) {
  const sectorStatus = capture.radii.map((radius, sector) => {
    if (!(radius > 0)) return "missing";
    const target = Number(targetRadii?.[sector]);
    if (!(target > 0)) return "bad";
    return Math.abs(radius - target) / target <= tolerance ? "good" : "bad";
  });
  const covered = sectorStatus.filter((status) => status !== "missing");
  const errors = capture.radii.flatMap((radius, sector) => {
    const target = Number(targetRadii?.[sector]);
    return radius > 0 && target > 0 ? [Math.abs(radius - target) / target] : [];
  });
  return {
    coverage: covered.length,
    complete: covered.length === ROUNDNESS_TEST_SECTOR_COUNT,
    pass: covered.length === ROUNDNESS_TEST_SECTOR_COUNT
      && sectorStatus.every((status) => status === "good"),
    errorPercent: errors.length
      ? errors.reduce((total, error) => total + error, 0) / errors.length * 100
      : null,
    sectorStatus,
  };
}

/**
 * Convert captured sector radii into SVG polygon coordinates.
 *
 * @param {{radii: number[]}} capture
 * @param {number} scale
 * @returns {string}
 */
export function roundnessTracePoints(capture, scale = 100) {
  return capture.radii.map((radius, index) => {
    const angle = index * Math.PI * 2 / ROUNDNESS_TEST_SECTOR_COUNT;
    const displayRadius = Math.min(1.1, Math.max(0, radius)) * scale;
    return `${(Math.cos(angle) * displayRadius).toFixed(2)},${(Math.sin(angle) * displayRadius).toFixed(2)}`;
  }).join(" ");
}

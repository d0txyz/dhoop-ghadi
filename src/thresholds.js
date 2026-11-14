// WBGT limits in deg C, by workload.
// Each row is [work as usual, 45 min work per hour, 30 min, 15 min]; above the last value: stop.
// `null` means that work/rest ratio is not offered for that workload at any temperature.
// Source: ACGIH screening criteria for heat stress exposure (TLV for acclimatized workers,
// Action Limit for workers who are not acclimatized). See docs/METHOD.md.

export const LIMITS = {
  acclimatized: {
    light: [31.0, 31.0, 32.0, 32.5],
    moderate: [28.0, 29.0, 30.0, 31.5],
    heavy: [null, 27.5, 29.0, 30.5],
    veryHeavy: [null, null, 28.0, 30.0],
  },
  unacclimatized: {
    light: [28.0, 28.5, 29.5, 30.0],
    moderate: [25.0, 26.0, 27.0, 29.0],
    heavy: [null, 24.0, 25.5, 28.0],
    veryHeavy: [null, null, 24.5, 27.0],
  },
};

// Minutes of actual work in one hour at each level (0 to 4).
export const WORK_MINUTES = [60, 45, 30, 15, 0];

// Kinds of work and the workload class used for each.
export const WORK_TYPES = {
  construction: 'heavy',
  farm: 'heavy',
  brickKiln: 'heavy',
  loading: 'veryHeavy',
  delivery: 'moderate',
  vending: 'light',
  sanitation: 'moderate',
};

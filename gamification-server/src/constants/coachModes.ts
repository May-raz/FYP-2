export const COACH_MODES = ['gentle', 'strict', 'debate'] as const;
export type CoachModeType = (typeof COACH_MODES)[number];

/** Minimum composite level to unlock coach mode. */
export const COACH_MODE_MIN_COMPOSITE: Record<CoachModeType, number> = {
  gentle: 1,
  strict: 4,
  debate: 7,
};

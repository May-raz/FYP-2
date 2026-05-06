/**
 * Fluency Engine — XP thresholds and reward weights (shared rules).
 */

export const XP_THRESHOLDS = [
  0, // Level 1
  200, // Level 2
  500, // Level 3
  1000, // Level 4
  1800, // Level 5
  3000, // Level 6
  4500, // Level 7
  6500, // Level 8
  9000, // Level 9
  12000, // Level 10
] as const;

export const XP_REWARDS = {
  /** Per session turn — high fluency signals */
  FLUENT_TURN: 10,
  /** Zero grammar issues on a turn */
  GRAMMAR_CLEAN_TURN: 8,
  /** Tone matched scenario / coach context */
  EQ_APPROPRIATE_RESPONSE: 12,

  RESILIENCE_BONUS: 20,
  /** Added to multiplier: +10% XP per full 7-day streak block */
  STREAK_MULTIPLIER: 0.1,
  PERFECT_SESSION: 50,

  QUIZ_CORRECT_ANSWER: 5,
  QUIZ_PERFECT_SCORE: 25,

  FLASHCARD_CORRECT: 8,
  FLASHCARD_FIRST_TRY: 12,

  SCENARIO_COMPLETE: 40,
  SCENARIO_EXCELLENT: 60,
} as const;

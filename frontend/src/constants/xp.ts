/**
 * Fluency Engine — XP thresholds & rewards (keep in sync with `gamification-server/src/constants/xp.ts`).
 */

export const XP_THRESHOLDS = [
  0, 200, 500, 1000, 1800, 3000, 4500, 6500, 9000, 12000,
] as const;

export const XP_REWARDS = {
  FLUENT_TURN: 10,
  GRAMMAR_CLEAN_TURN: 8,
  EQ_APPROPRIATE_RESPONSE: 12,
  RESILIENCE_BONUS: 20,
  STREAK_MULTIPLIER: 0.1,
  PERFECT_SESSION: 50,
  QUIZ_CORRECT_ANSWER: 5,
  QUIZ_PERFECT_SCORE: 25,
  FLASHCARD_CORRECT: 8,
  FLASHCARD_FIRST_TRY: 12,
  SCENARIO_COMPLETE: 40,
  SCENARIO_EXCELLENT: 60,
} as const;

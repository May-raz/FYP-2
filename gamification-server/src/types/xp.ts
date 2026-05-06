import type { Types } from 'mongoose';

export type XpTrack = 'fluency' | 'grammar' | 'eq';

export interface SessionScores {
  fluency: number;
  grammar: number;
  eq: number;
}

export interface SessionEmotionProfile {
  dominant: string;
  anxietyFlag: boolean;
}

/** Optional fine-grained signals from the chat pipeline (defaults fall back to session scores). */
export interface SessionXpMetrics {
  /** 0–100 normalized WPM quality */
  wordsPerMinuteScore?: number;
  /** 0–100, higher = fewer problematic pauses */
  pauseFrequencyScore?: number;
  /** 0–1 unique / total token ratio */
  vocabularyDiversityRatio?: number;
  /** 0–1 share of turns with no grammar errors */
  grammarErrorFreeTurnRatio?: number;
  /** Relative improvement vs previous session (0 = same, 1 = strong improvement) */
  grammarErrorReductionVsPrev?: number;
  /** 0–100 tone appropriateness from emotion module */
  eqToneScore?: number;
}

export interface AwardSessionXpInput {
  sessionId: string;
  scores: SessionScores;
  turnCount: number;
  emotionProfile: SessionEmotionProfile;
  /** Default true — set false for abandoned sessions */
  sessionCompleted?: boolean;
  metrics?: SessionXpMetrics;
}

export interface UserLevelsSnapshot {
  fluency: number;
  grammar: number;
  eq: number;
  composite: number;
}

export interface LevelUpEvent {
  track: XpTrack;
  fromLevel: number;
  toLevel: number;
}

export interface AwardSessionXpResult {
  xpAwarded: { fluency: number; grammar: number; eq: number };
  newLevels: UserLevelsSnapshot;
  levelUps: LevelUpEvent[];
}

/** Minimal user fields required for XP math */
export interface UserXpSnapshot {
  _id: Types.ObjectId | string;
  xp: { fluency: number; grammar: number; eq: number };
  levels: UserLevelsSnapshot;
  streak: { current: number };
}

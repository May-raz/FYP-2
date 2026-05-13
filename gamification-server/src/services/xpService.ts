import { XP_REWARDS, XP_THRESHOLDS } from '../constants/xp';
import { supabase } from '../config/supabase';
import type {
  AwardSessionXpInput,
  AwardSessionXpResult,
  LevelUpEvent,
  UserLevelsSnapshot,
  UserXpSnapshot,
  XpTrack,
} from '../types/xp';
import type { GamerUserRow } from '../types/gamer';

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Highest level (1–10) whose XP threshold is still ≤ current XP.
 */
export function getLevelFromXP(xp: number, _track: XpTrack): number {
  const x = Math.max(0, xp);
  let level = 1;
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    const threshold = XP_THRESHOLDS[i]!;
    if (x >= threshold) {
      level = i + 1;
      break;
    }
  }
  return Math.min(10, Math.max(1, level));
}

/**
 * Composite level = average of the three track levels (floored).
 */
export function getCompositeLevel(levels: Pick<UserLevelsSnapshot, 'fluency' | 'grammar' | 'eq'>): number {
  const sum = levels.fluency + levels.grammar + levels.eq;
  return Math.floor(sum / 3);
}

function streakXpMultiplier(currentStreak: number): number {
  const milestones = Math.floor(Math.max(0, currentStreak) / 7);
  return 1 + milestones * XP_REWARDS.STREAK_MULTIPLIER;
}

/**
 * Raw XP from session scores, turn count, optional metrics (before streak / bonuses).
 */
export function computeBaseTrackXp(input: AwardSessionXpInput): {
  fluency: number;
  grammar: number;
  eq: number;
} {
  const { scores, turnCount, metrics = {} } = input;
  const turns = Math.max(0, Math.floor(turnCount));
  if (turns === 0) {
    return { fluency: 0, grammar: 0, eq: 0 };
  }

  const wpm = clamp01((metrics.wordsPerMinuteScore ?? scores.fluency) / 100);
  const pause = clamp01((metrics.pauseFrequencyScore ?? scores.fluency) / 100);
  const vocab = metrics.vocabularyDiversityRatio != null
    ? clamp01(metrics.vocabularyDiversityRatio)
    : wpm;

  const fluencyQuality = clamp01(0.35 * wpm + 0.35 * pause + 0.3 * vocab);
  const fluentTurns = Math.round(turns * fluencyQuality);
  const fluency = fluentTurns * XP_REWARDS.FLUENT_TURN;

  const errFree = clamp01(metrics.grammarErrorFreeTurnRatio ?? scores.grammar / 100);
  const cleanTurns = Math.round(turns * errFree);
  let grammar = cleanTurns * XP_REWARDS.GRAMMAR_CLEAN_TURN;
  const reduction = metrics.grammarErrorReductionVsPrev ?? 0;
  if (reduction > 0) {
    grammar += Math.min(40, Math.round(20 * clamp01(reduction)));
  }

  const eqTone = clamp01((metrics.eqToneScore ?? scores.eq) / 100);
  const eqTurns = Math.round(turns * eqTone);
  const eq = eqTurns * XP_REWARDS.EQ_APPROPRIATE_RESPONSE;

  return {
    fluency: Math.max(0, fluency),
    grammar: Math.max(0, grammar),
    eq: Math.max(0, eq),
  };
}

/**
 * Applies streak multiplier, resilience bonus (grammar), and perfect-session bonus.
 */
export function applySessionXpModifiers(
  base: { fluency: number; grammar: number; eq: number },
  input: AwardSessionXpInput,
  streakCurrent: number
): { fluency: number; grammar: number; eq: number } {
  const mult = streakXpMultiplier(streakCurrent);
  let fluency = base.fluency * mult;
  let grammar = base.grammar * mult;
  let eq = base.eq * mult;

  const completed = input.sessionCompleted !== false;
  if (completed && input.emotionProfile.anxietyFlag) {
    grammar += XP_REWARDS.RESILIENCE_BONUS;
  }

  const { scores } = input;
  if (scores.fluency > 85 && scores.grammar > 85 && scores.eq > 85) {
    const b = XP_REWARDS.PERFECT_SESSION;
    const a = Math.ceil(b / 3);
    const c = Math.floor(b / 3);
    const rem = b - a - c;
    fluency += a;
    grammar += c;
    eq += rem;
  }

  return {
    fluency: Math.max(0, Math.floor(fluency)),
    grammar: Math.max(0, Math.floor(grammar)),
    eq: Math.max(0, Math.floor(eq)),
  };
}

function buildLevelUps(
  oldLevels: Pick<UserLevelsSnapshot, 'fluency' | 'grammar' | 'eq'>,
  newLevels: Pick<UserLevelsSnapshot, 'fluency' | 'grammar' | 'eq'>
): LevelUpEvent[] {
  const tracks: XpTrack[] = ['fluency', 'grammar', 'eq'];
  const out: LevelUpEvent[] = [];
  for (const t of tracks) {
    const from = oldLevels[t];
    const to = newLevels[t];
    if (to > from) {
      out.push({ track: t, fromLevel: from, toLevel: to });
    }
  }
  return out;
}

/**
 * Pure XP award calculation (no DB). Used by `awardSessionXP` and unit tests.
 */
export function calculateSessionXpAward(
  user: Pick<UserXpSnapshot, 'xp' | 'levels' | 'streak'>,
  input: AwardSessionXpInput
): AwardSessionXpResult & { newXp: { fluency: number; grammar: number; eq: number }; totalXp: number } {
  const streakCurrent = user.streak?.current ?? 0;
  const base = computeBaseTrackXp(input);
  const xpAwarded = applySessionXpModifiers(base, input, streakCurrent);

  const newXp = {
    fluency: user.xp.fluency + xpAwarded.fluency,
    grammar: user.xp.grammar + xpAwarded.grammar,
    eq: user.xp.eq + xpAwarded.eq,
  };

  const newLevels: UserLevelsSnapshot = {
    fluency: getLevelFromXP(newXp.fluency, 'fluency'),
    grammar: getLevelFromXP(newXp.grammar, 'grammar'),
    eq: getLevelFromXP(newXp.eq, 'eq'),
    composite: 1,
  };
  newLevels.composite = getCompositeLevel(newLevels);

  const levelUps = buildLevelUps(user.levels, newLevels);
  const totalXp = xpAwarded.fluency + xpAwarded.grammar + xpAwarded.eq;

  return {
    xpAwarded,
    newLevels,
    levelUps,
    newXp,
    totalXp,
  };
}

/**
 * Awards session XP: updates user XP pools, derived levels, and weekly XP aggregate.
 */
export async function awardSessionXP(
  userId: string,
  sessionData: AwardSessionXpInput
): Promise<AwardSessionXpResult> {
  const { data: userDoc, error: userError } = await supabase
    .from('gamer_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle<GamerUserRow>();
  if (userError) throw userError;
  if (!userDoc) {
    throw new Error('User not found');
  }

  const user: UserXpSnapshot = {
    _id: userDoc.id,
    xp: {
      fluency: userDoc.xp_fluency,
      grammar: userDoc.xp_grammar,
      eq: userDoc.xp_eq,
    },
    levels: {
      fluency: userDoc.level_fluency,
      grammar: userDoc.level_grammar,
      eq: userDoc.level_eq,
      composite: userDoc.level_composite,
    },
    streak: { current: userDoc.streak_current },
  };

  const calc = calculateSessionXpAward(user, sessionData);

  const { error: updateError } = await supabase
    .from('gamer_users')
    .update({
      xp_fluency: userDoc.xp_fluency + calc.xpAwarded.fluency,
      xp_grammar: userDoc.xp_grammar + calc.xpAwarded.grammar,
      xp_eq: userDoc.xp_eq + calc.xpAwarded.eq,
      level_fluency: calc.newLevels.fluency,
      level_grammar: calc.newLevels.grammar,
      level_eq: calc.newLevels.eq,
      level_composite: calc.newLevels.composite,
      weekly_xp_earned: (userDoc.weekly_xp_earned ?? 0) + calc.totalXp,
    })
    .eq('id', userId);
  if (updateError) throw updateError;

  return {
    xpAwarded: calc.xpAwarded,
    newLevels: calc.newLevels,
    levelUps: calc.levelUps,
  };
}

/**
 * Increment XP pools (e.g. flashcard review) and recompute stored levels.
 */
export async function incrementUserXp(
  userId: string,
  delta: { fluency?: number; grammar?: number; eq?: number }
): Promise<void> {
  const df = delta.fluency ?? 0;
  const dg = delta.grammar ?? 0;
  const de = delta.eq ?? 0;
  if (df === 0 && dg === 0 && de === 0) return;

  const { data: u, error: userError } = await supabase
    .from('gamer_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle<GamerUserRow>();
  if (userError) throw userError;
  if (!u) {
    throw new Error('User not found');
  }

  const nextXp = {
    fluency: (u.xp_fluency ?? 0) + df,
    grammar: (u.xp_grammar ?? 0) + dg,
    eq: (u.xp_eq ?? 0) + de,
  };
  const nextLevels = {
    fluency: getLevelFromXP(nextXp.fluency, 'fluency'),
    grammar: getLevelFromXP(nextXp.grammar, 'grammar'),
    eq: getLevelFromXP(nextXp.eq, 'eq'),
    composite: 1,
  };
  nextLevels.composite = getCompositeLevel(nextLevels);

  const { error: updateError } = await supabase
    .from('gamer_users')
    .update({
      xp_fluency: nextXp.fluency,
      xp_grammar: nextXp.grammar,
      xp_eq: nextXp.eq,
      level_fluency: nextLevels.fluency,
      level_grammar: nextLevels.grammar,
      level_eq: nextLevels.eq,
      level_composite: nextLevels.composite,
      weekly_xp_earned: (u.weekly_xp_earned ?? 0) + df + dg + de,
    })
    .eq('id', userId);
  if (updateError) throw updateError;
}

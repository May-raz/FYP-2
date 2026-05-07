import { supabase } from '../config/supabase';
import { utcMidnightDate, utcMidnightMs } from '../lib/utcDate';
import type { GamerUserRow } from '../types/gamer';

export interface SessionEmotionProfileInput {
  dominant: string;
  anxietyFlag: boolean;
}

export interface UpdateStreakResult {
  current: number;
  longest: number;
  resilienceBonusAwarded: boolean;
  sameDaySession: boolean;
}

/**
 * Pure streak transition (UTC calendar days).
 */
export function computeStreakTransition(
  lastSessionUtcMs: number | null,
  now: Date,
  currentStreak: number
): { nextCurrent: number; sameDay: boolean; continuedFromYesterday: boolean; reset: boolean } {
  const todayStart = utcMidnightMs(now);
  const yesterdayStart = todayStart - 86400000;

  if (lastSessionUtcMs === null) {
    return {
      nextCurrent: 1,
      sameDay: false,
      continuedFromYesterday: false,
      reset: false,
    };
  }

  const lastDay = utcMidnightMs(new Date(lastSessionUtcMs));

  if (lastDay === todayStart) {
    return {
      nextCurrent: currentStreak,
      sameDay: true,
      continuedFromYesterday: false,
      reset: false,
    };
  }

  if (lastDay === yesterdayStart) {
    return {
      nextCurrent: currentStreak + 1,
      sameDay: false,
      continuedFromYesterday: true,
      reset: false,
    };
  }

  return {
    nextCurrent: 1,
    sameDay: false,
    continuedFromYesterday: false,
    reset: true,
  };
}

const MAX_HISTORY = 400;

/**
 * Updates streak counters and history. Does **not** award XP (resilience XP lives in `xpService`).
 */
export async function updateStreak(
  userId: string,
  sessionEmotionProfile: SessionEmotionProfileInput,
  sessionCompleted: boolean,
  avgSessionScore: number
): Promise<UpdateStreakResult> {
  const { data: user, error: userError } = await supabase
    .from('gamer_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle<GamerUserRow>();
  if (userError) throw userError;
  if (!user) {
    throw new Error('User not found');
  }

  const lastRaw = user.streak_last_session;
  const lastMs = lastRaw ? utcMidnightMs(new Date(lastRaw)) : null;
  const now = new Date();
  const transition = computeStreakTransition(lastMs, now, user.streak_current);

  const current = transition.nextCurrent;
  const longest = Math.max(user.streak_longest, current);
  const resilienceBonusAwarded = !!(sessionCompleted && sessionEmotionProfile.anxietyFlag);

  const todayDate = utcMidnightDate(now);
  const history = Array.isArray(user.streak_history)
    ? [...(user.streak_history as Array<{ date: string; score: number; emotionFlag: boolean }>)]
    : [];
  const emotionFlag = resilienceBonusAwarded;

  const lastHist = history.length > 0 ? history[history.length - 1]! : null;
  if (lastHist && utcMidnightMs(new Date(lastHist.date)) === utcMidnightMs(now)) {
    lastHist.score = avgSessionScore;
    lastHist.emotionFlag = lastHist.emotionFlag || emotionFlag;
  } else {
    history.push({ date: todayDate.toISOString(), score: avgSessionScore, emotionFlag });
  }

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const { error: updateError } = await supabase
    .from('gamer_users')
    .update({
      streak_current: current,
      streak_longest: longest,
      streak_last_session: todayDate.toISOString(),
      streak_history: history,
    })
    .eq('id', userId);
  if (updateError) throw updateError;

  return {
    current,
    longest,
    resilienceBonusAwarded,
    sameDaySession: transition.sameDay,
  };
}

/**
 * Micro-session: preserves streak continuity without full session XP (Part 4).
 */
export async function recordMicroSession(
  userId: string,
  sessionEmotionProfile: SessionEmotionProfileInput
): Promise<UpdateStreakResult> {
  return updateStreak(userId, sessionEmotionProfile, true, 0);
}

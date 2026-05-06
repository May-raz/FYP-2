import mongoose from 'mongoose';
import { UserModel } from '../models/User';
import { utcMidnightDate, utcMidnightMs } from '../lib/utcDate';

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
  if (!mongoose.isValidObjectId(userId)) {
    throw new Error('Invalid userId');
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const lastRaw = user.streak.lastSessionDate;
  const lastMs = lastRaw ? utcMidnightMs(new Date(lastRaw)) : null;
  const now = new Date();
  const transition = computeStreakTransition(lastMs, now, user.streak.current);

  const current = transition.nextCurrent;
  const longest = Math.max(user.streak.longest, current);
  const resilienceBonusAwarded = !!(sessionCompleted && sessionEmotionProfile.anxietyFlag);

  const todayDate = utcMidnightDate(now);
  const history = user.streak.streakHistory;
  const emotionFlag = resilienceBonusAwarded;

  const lastHist = history.length > 0 ? history[history.length - 1]! : null;
  if (lastHist && utcMidnightMs(new Date(lastHist.date)) === utcMidnightMs(now)) {
    lastHist.score = avgSessionScore;
    lastHist.emotionFlag = lastHist.emotionFlag || emotionFlag;
  } else {
    history.push({ date: todayDate, score: avgSessionScore, emotionFlag });
  }

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  user.streak.current = current;
  user.streak.longest = longest;
  user.streak.lastSessionDate = todayDate;
  user.markModified('streak.streakHistory');

  await user.save();

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

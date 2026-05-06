import mongoose from 'mongoose';
import { XP_REWARDS } from '../constants/xp';
import { MistakeModel } from '../models/Mistake';
import type { Mistake } from '../models/Mistake';

export type ReviewResult = 'correct' | 'incorrect' | 'skipped';

const MS_PER_DAY = 86400000;

function addDaysUtc(from: Date, days: number): Date {
  return new Date(from.getTime() + Math.round(days) * MS_PER_DAY);
}

/**
 * SM-2–style update per Fluency Engine spec (simplified intervals).
 */
export function computeSm2Update(
  card: Pick<Mistake, 'intervalDays' | 'easeFactor'>,
  result: ReviewResult
): { intervalDays: number; easeFactor: number } {
  let { intervalDays, easeFactor } = card;

  if (result === 'skipped') {
    return { intervalDays, easeFactor };
  }

  if (result === 'incorrect') {
    return {
      intervalDays: 1,
      easeFactor: Math.max(1.3, easeFactor - 0.2),
    };
  }

  const newEase = Math.min(3, easeFactor + 0.1);
  const newInterval = Math.max(1, Math.round(intervalDays * easeFactor));
  return {
    intervalDays: newInterval,
    easeFactor: newEase,
  };
}

export interface ReviewFlashcardResult {
  card: Mistake;
  xpAwarded: number;
}

/**
 * Applies SM-2, bumps reviewCount, sets nextReviewDate. XP amounts returned for route to persist on user.
 */
export async function reviewFlashcard(
  userId: string,
  mistakeId: string,
  result: ReviewResult
): Promise<ReviewFlashcardResult> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(mistakeId)) {
    throw new Error('Invalid id');
  }

  const card = await MistakeModel.findOne({
    _id: mistakeId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!card) {
    throw new Error('Card not found');
  }

  const priorReviewCount = card.reviewCount;
  const next = computeSm2Update(card, result);
  const now = new Date();

  card.intervalDays = next.intervalDays;
  card.easeFactor = next.easeFactor;
  card.reviewCount = priorReviewCount + 1;
  card.lastReviewResult = result === 'skipped' ? null : result;
  card.nextReviewDate = addDaysUtc(now, card.intervalDays);

  let xpAwarded = 0;
  if (result === 'correct') {
    xpAwarded =
      priorReviewCount === 0 ? XP_REWARDS.FLASHCARD_FIRST_TRY : XP_REWARDS.FLASHCARD_CORRECT;
  }

  await card.save();

  return { card, xpAwarded };
}

import { XP_REWARDS } from '../constants/xp';
import { supabase } from '../config/supabase';
import { computeSm2Update, type ReviewResult } from './flashcardScheduler';
export interface MistakeCard {
  id: string;
  user_id: string;
  session_id: string | null;
  original_utterance: string;
  corrected_form: string;
  error_type: 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other';
  error_tag: string;
  next_review_date: string;
  interval_days: number;
  ease_factor: number;
  review_count: number;
  last_review_result?: ReviewResult | null;
}

const MS_PER_DAY = 86400000;

function addDaysUtc(from: Date, days: number): Date {
  return new Date(from.getTime() + Math.round(days) * MS_PER_DAY);
}

export interface ReviewFlashcardResult {
  card: MistakeCard;
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
  const { data: card, error: findError } = await supabase
    .from('gamer_mistakes')
    .select('*')
    .eq('id', mistakeId)
    .eq('user_id', userId)
    .maybeSingle<MistakeCard>();
  if (findError) throw findError;
  if (!card) {
    throw new Error('Card not found');
  }

  const priorReviewCount = card.review_count;
  const next = computeSm2Update(
    { intervalDays: card.interval_days, easeFactor: card.ease_factor },
    result
  );
  const now = new Date();
  const nextReviewDate = addDaysUtc(now, next.intervalDays).toISOString();
  const nextReviewCount = priorReviewCount + 1;
  const lastResult = result === 'skipped' ? null : result;

  let xpAwarded = 0;
  if (result === 'easy' || result === 'medium' || result === 'correct') {
    xpAwarded =
      priorReviewCount === 0 ? XP_REWARDS.FLASHCARD_FIRST_TRY : XP_REWARDS.FLASHCARD_CORRECT;
  }

  let updatePayload: Record<string, unknown> = {
    interval_days: next.intervalDays,
    ease_factor: next.easeFactor,
    review_count: nextReviewCount,
    last_review_result: lastResult,
    next_review_date: nextReviewDate,
  };

  let { data: updatedCard, error: updateError } = await supabase
    .from('gamer_mistakes')
    .update(updatePayload)
    .eq('id', mistakeId)
    .eq('user_id', userId)
    .select('*')
    .single<MistakeCard>();
  if (updateError) {
    const msg = String(updateError.message || '');
    // Backward compatibility: if DB schema doesn't yet include last_review_result, retry without it.
    if (msg.toLowerCase().includes('last_review_result')) {
      updatePayload = {
        interval_days: next.intervalDays,
        ease_factor: next.easeFactor,
        review_count: nextReviewCount,
        next_review_date: nextReviewDate,
      };
      const retry = await supabase
        .from('gamer_mistakes')
        .update(updatePayload)
        .eq('id', mistakeId)
        .eq('user_id', userId)
        .select('*')
        .single<MistakeCard>();
      updatedCard = retry.data ?? null;
      updateError = retry.error ?? null;
    }
  }
  if (updateError) throw updateError;
  if (!updatedCard) {
    throw new Error('Card update failed');
  }

  return { card: updatedCard, xpAwarded };
}

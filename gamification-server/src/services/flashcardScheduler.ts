export type ReviewResult = 'easy' | 'medium' | 'hard' | 'correct' | 'incorrect' | 'skipped';

export function computeSm2Update(
  card: { intervalDays: number; easeFactor: number },
  result: ReviewResult
): { intervalDays: number; easeFactor: number } {
  const normalizedResult: ReviewResult = result === 'correct' ? 'medium' : result;
  const intervalDays = Math.max(1, Math.round(Number(card.intervalDays || 1)));
  const easeFactor = Math.max(1.3, Math.min(3, Number(card.easeFactor || 2.5)));

  if (normalizedResult === 'skipped') {
    return { intervalDays, easeFactor };
  }

  if (normalizedResult === 'incorrect' || normalizedResult === 'hard') {
    if (normalizedResult === 'hard') {
      return {
        intervalDays: Math.max(1, Math.round(intervalDays * 0.6)),
        easeFactor: Math.max(1.3, Number((easeFactor - 0.08).toFixed(2))),
      };
    }
    return {
      intervalDays: 1,
      easeFactor: Math.max(1.3, Number((easeFactor - 0.2).toFixed(2))),
    };
  }

  const qualityBoost = normalizedResult === 'easy' ? 0.15 : 0.05;
  const intervalMultiplier = normalizedResult === 'easy' ? easeFactor + 0.55 : easeFactor + 0.2;
  const minAdvance = normalizedResult === 'easy' ? intervalDays + 2 : intervalDays + 1;
  const newEase = Math.min(3, Number((easeFactor + qualityBoost).toFixed(2)));
  const newInterval = Math.max(minAdvance, Math.round(intervalDays * intervalMultiplier));
  return {
    intervalDays: newInterval,
    easeFactor: newEase,
  };
}

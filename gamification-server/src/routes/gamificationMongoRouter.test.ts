import { describe, expect, it } from 'vitest';
import {
  classifyCardType,
  computePriorityScore,
  computeReviewOutcome,
  normalizeReviewResult,
} from './gamificationMongoRouter';

describe('flashcard review helpers', () => {
  it('normalizes review results consistently', () => {
    expect(normalizeReviewResult('correct')).toBe('medium');
    expect(normalizeReviewResult('incorrect')).toBe('incorrect');
    expect(normalizeReviewResult('hard')).toBe('hard');
    expect(normalizeReviewResult('bad-value')).toBeNull();
  });

  it('classifies card types by error data', () => {
    expect(classifyCardType('grammar', 'she go', 'she goes')).toBe('grammar_correction');
    expect(classifyCardType('vocabulary', 'big rain', 'heavy rain')).toBe('vocabulary_review');
    expect(classifyCardType('other', 'hello', 'hello')).toBe('pronunciation_review');
    expect(classifyCardType('other', 'i am go', 'i am going')).toBe('contextual_usage');
  });

  it('applies deterministic schedule for incorrect/hard/easy', () => {
    const incorrect = computeReviewOutcome({ intervalDays: 8, easeFactor: 2.5 }, 'incorrect');
    expect(incorrect.intervalDays).toBe(1);
    expect(incorrect.easeFactor).toBe(2.3);

    const hard = computeReviewOutcome({ intervalDays: 10, easeFactor: 2.5 }, 'hard');
    expect(hard.intervalDays).toBe(6);
    expect(hard.easeFactor).toBe(2.42);

    const easy = computeReviewOutcome({ intervalDays: 3, easeFactor: 2.5 }, 'easy');
    expect(easy.intervalDays).toBe(9);
    expect(easy.easeFactor).toBe(2.65);
  });

  it('prioritizes weak overdue pronunciation cards', () => {
    const now = new Date('2026-05-08T12:00:00.000Z');
    const weak = {
      nextReviewDate: new Date('2026-05-06T12:00:00.000Z'),
      easeFactor: 1.5,
      reviewCount: 9,
      lastReviewResult: 'incorrect',
      cardType: 'pronunciation_review',
    };
    const strong = {
      nextReviewDate: new Date('2026-05-08T11:00:00.000Z'),
      easeFactor: 2.8,
      reviewCount: 1,
      lastReviewResult: 'medium',
      cardType: 'grammar_correction',
    };
    expect(computePriorityScore(weak, now)).toBeGreaterThan(computePriorityScore(strong, now));
  });
});

import { describe, expect, it } from 'vitest';
import { computeSm2Update } from './flashcardService';

describe('computeSm2Update', () => {
  it('leaves interval and ease unchanged on skip', () => {
    const r = computeSm2Update({ intervalDays: 5, easeFactor: 2.2 }, 'skipped');
    expect(r).toEqual({ intervalDays: 5, easeFactor: 2.2 });
  });

  it('resets interval to 1 and lowers ease on incorrect', () => {
    const r = computeSm2Update({ intervalDays: 14, easeFactor: 2.5 }, 'incorrect');
    expect(r.intervalDays).toBe(1);
    expect(r.easeFactor).toBe(2.3);
  });

  it('does not drop ease below 1.3 on incorrect', () => {
    const r = computeSm2Update({ intervalDays: 3, easeFactor: 1.35 }, 'incorrect');
    expect(r.easeFactor).toBe(1.3);
  });

  it('grows interval and ease on correct (uses prior ease for interval step)', () => {
    const r = computeSm2Update({ intervalDays: 1, easeFactor: 2.5 }, 'correct');
    expect(r.easeFactor).toBe(2.6);
    expect(r.intervalDays).toBe(Math.max(1, Math.round(1 * 2.5)));
  });

  it('caps ease at 3 on repeated correct reviews', () => {
    const r = computeSm2Update({ intervalDays: 10, easeFactor: 2.95 }, 'correct');
    expect(r.easeFactor).toBe(3);
  });
});

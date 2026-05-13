import { describe, expect, it } from 'vitest';
import { computeStreakTransition } from './streakService';

describe('computeStreakTransition', () => {
  const nowMay5 = new Date('2026-05-05T15:30:00Z');

  it('starts at 1 when there is no prior session', () => {
    const r = computeStreakTransition(null, nowMay5, 7);
    expect(r).toMatchObject({
      nextCurrent: 1,
      sameDay: false,
      continuedFromYesterday: false,
      reset: false,
    });
  });

  it('keeps streak on same UTC calendar day', () => {
    const lastSameDay = Date.UTC(2026, 4, 5, 8, 0, 0);
    const r = computeStreakTransition(lastSameDay, nowMay5, 4);
    expect(r).toMatchObject({
      nextCurrent: 4,
      sameDay: true,
      continuedFromYesterday: false,
      reset: false,
    });
  });

  it('increments when last session was yesterday (UTC)', () => {
    const lastYesterday = Date.UTC(2026, 4, 4, 23, 0, 0);
    const r = computeStreakTransition(lastYesterday, nowMay5, 4);
    expect(r).toMatchObject({
      nextCurrent: 5,
      sameDay: false,
      continuedFromYesterday: true,
      reset: false,
    });
  });

  it('resets when gap is more than one UTC day', () => {
    const lastOld = Date.UTC(2026, 4, 2, 12, 0, 0);
    const r = computeStreakTransition(lastOld, nowMay5, 9);
    expect(r).toMatchObject({
      nextCurrent: 1,
      sameDay: false,
      continuedFromYesterday: false,
      reset: true,
    });
  });
});

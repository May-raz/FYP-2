import { describe, expect, it, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { XP_REWARDS, XP_THRESHOLDS } from '../constants/xp';
import type { AwardSessionXpInput } from '../types/xp';

const findByIdMock = vi.fn();
const updateOneMock = vi.fn();

vi.mock('../models/User', () => ({
  UserModel: {
    findById: (...args: unknown[]) => findByIdMock(...args),
    updateOne: (...args: unknown[]) => updateOneMock(...args),
  },
}));

import {
  applySessionXpModifiers,
  calculateSessionXpAward,
  computeBaseTrackXp,
  getCompositeLevel,
  getLevelFromXP,
  awardSessionXP,
} from './xpService';

const baseInput = (over: Partial<AwardSessionXpInput> = {}): AwardSessionXpInput => ({
  sessionId: new mongoose.Types.ObjectId().toHexString(),
  scores: { fluency: 80, grammar: 80, eq: 80 },
  turnCount: 10,
  emotionProfile: { dominant: 'confident', anxietyFlag: false },
  sessionCompleted: true,
  ...over,
});

describe('getLevelFromXP', () => {
  it.each([
    [0, 1],
    [199, 1],
    [200, 2],
    [499, 2],
    [500, 3],
    [999, 3],
    [1000, 4],
    [1799, 4],
    [1800, 5],
    [2999, 5],
    [3000, 6],
    [4499, 6],
    [4500, 7],
    [6499, 7],
    [6500, 8],
    [8999, 8],
    [9000, 9],
    [11999, 9],
    [12000, 10],
    [500_000, 10],
  ])('xp %i → level %i', (xp, expected) => {
    expect(getLevelFromXP(xp, 'fluency')).toBe(expected);
    expect(getLevelFromXP(xp, 'grammar')).toBe(expected);
    expect(getLevelFromXP(xp, 'eq')).toBe(expected);
  });

  it('uses XP_THRESHOLDS length', () => {
    expect(XP_THRESHOLDS).toHaveLength(10);
  });
});

describe('getCompositeLevel', () => {
  it('floors average of three track levels', () => {
    expect(getCompositeLevel({ fluency: 3, grammar: 4, eq: 5 })).toBe(4);
    expect(getCompositeLevel({ fluency: 1, grammar: 1, eq: 1 })).toBe(1);
    expect(getCompositeLevel({ fluency: 10, grammar: 10, eq: 9 })).toBe(9);
  });
});

describe('computeBaseTrackXp', () => {
  it('returns zeros when no turns', () => {
    expect(computeBaseTrackXp(baseInput({ turnCount: 0 }))).toEqual({
      fluency: 0,
      grammar: 0,
      eq: 0,
    });
  });

  it('produces positive XP for strong session defaults', () => {
    const r = computeBaseTrackXp(
      baseInput({ turnCount: 5, scores: { fluency: 100, grammar: 100, eq: 100 } })
    );
    expect(r.fluency).toBeGreaterThan(0);
    expect(r.grammar).toBeGreaterThan(0);
    expect(r.eq).toBeGreaterThan(0);
  });

  it('respects explicit metrics over score fallbacks', () => {
    const low = computeBaseTrackXp(
      baseInput({
        turnCount: 10,
        scores: { fluency: 100, grammar: 100, eq: 100 },
        metrics: {
          wordsPerMinuteScore: 20,
          pauseFrequencyScore: 20,
          vocabularyDiversityRatio: 0.1,
          grammarErrorFreeTurnRatio: 0.1,
          eqToneScore: 30,
        },
      })
    );
    const high = computeBaseTrackXp(
      baseInput({
        turnCount: 10,
        scores: { fluency: 20, grammar: 20, eq: 20 },
        metrics: {
          wordsPerMinuteScore: 95,
          pauseFrequencyScore: 95,
          vocabularyDiversityRatio: 0.9,
          grammarErrorFreeTurnRatio: 0.95,
          eqToneScore: 95,
        },
      })
    );
    expect(high.fluency).toBeGreaterThan(low.fluency);
    expect(high.grammar).toBeGreaterThan(low.grammar);
    expect(high.eq).toBeGreaterThan(low.eq);
  });
});

describe('applySessionXpModifiers', () => {
  it('applies streak multiplier (+10% per 7-day block)', () => {
    const base = { fluency: 100, grammar: 100, eq: 100 };
    const input = baseInput();
    const m0 = applySessionXpModifiers(base, input, 0);
    const m7 = applySessionXpModifiers(base, input, 7);
    expect(m7.fluency).toBe(Math.floor(100 * (1 + XP_REWARDS.STREAK_MULTIPLIER)));
    expect(m0.fluency).toBe(100);
  });

  it('adds resilience bonus to grammar when anxiety and session completed', () => {
    const base = { fluency: 50, grammar: 50, eq: 50 };
    const input = baseInput({
      emotionProfile: { dominant: 'anxious', anxietyFlag: true },
      sessionCompleted: true,
    });
    const out = applySessionXpModifiers(base, input, 0);
    expect(out.grammar).toBe(base.grammar + XP_REWARDS.RESILIENCE_BONUS);
    expect(out.fluency).toBe(base.fluency);
  });

  it('skips resilience when session not completed', () => {
    const base = { fluency: 50, grammar: 50, eq: 50 };
    const input = baseInput({
      emotionProfile: { dominant: 'anxious', anxietyFlag: true },
      sessionCompleted: false,
    });
    const out = applySessionXpModifiers(base, input, 0);
    expect(out.grammar).toBe(base.grammar);
  });

  it('adds perfect session bonus when all scores > 85', () => {
    const base = { fluency: 10, grammar: 10, eq: 10 };
    const input = baseInput({
      scores: { fluency: 90, grammar: 88, eq: 86 },
    });
    const out = applySessionXpModifiers(base, input, 0);
    const bonus =
      out.fluency + out.grammar + out.eq - (base.fluency + base.grammar + base.eq);
    expect(bonus).toBe(XP_REWARDS.PERFECT_SESSION);
  });
});

describe('calculateSessionXpAward', () => {
  it('returns level ups when crossing threshold', () => {
    const u = {
      xp: { fluency: 2900, grammar: 0, eq: 0 },
      levels: {
        fluency: getLevelFromXP(2900, 'fluency'),
        grammar: 1,
        eq: 1,
        composite: 1,
      },
      streak: { current: 0 },
    };
    u.levels.composite = getCompositeLevel(u.levels);
    const input = baseInput({
      turnCount: 20,
      scores: { fluency: 100, grammar: 0, eq: 0 },
      metrics: {
        wordsPerMinuteScore: 100,
        pauseFrequencyScore: 100,
        vocabularyDiversityRatio: 1,
        grammarErrorFreeTurnRatio: 0,
        eqToneScore: 0,
      },
    });
    const r = calculateSessionXpAward(u, input);
    expect(r.newXp.fluency).toBeGreaterThanOrEqual(3000);
    expect(r.levelUps.some((l) => l.track === 'fluency' && l.toLevel > l.fromLevel)).toBe(true);
  });
});

describe('awardSessionXP', () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    updateOneMock.mockReset();
  });

  it('loads user, persists deltas, returns award result', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const oid = new mongoose.Types.ObjectId(userId);
    const leanUser = {
      _id: oid,
      xp: { fluency: 100, grammar: 100, eq: 100 },
      levels: { fluency: 1, grammar: 1, eq: 1, composite: 1 },
      streak: { current: 0 },
    };

    findByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(leanUser),
    });
    updateOneMock.mockResolvedValue({ acknowledged: true });

    const result = await awardSessionXP(userId, baseInput({ turnCount: 5 }));

    expect(findByIdMock).toHaveBeenCalledWith(userId);
    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $inc: expect.objectContaining({
          'xp.fluency': result.xpAwarded.fluency,
          'weeklySnapshot.xpEarned': expect.any(Number),
        }),
        $set: { levels: result.newLevels },
      })
    );
    expect(result.xpAwarded.fluency + result.xpAwarded.grammar + result.xpAwarded.eq).toBeGreaterThan(
      0
    );
  });

  it('throws on invalid userId', async () => {
    await expect(awardSessionXP('not-an-id', baseInput())).rejects.toThrow('Invalid userId');
  });

  it('throws when user missing', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    findByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    await expect(awardSessionXP(userId, baseInput())).rejects.toThrow('User not found');
  });
});

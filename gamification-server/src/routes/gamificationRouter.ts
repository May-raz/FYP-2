import { Router, type Request, type Response } from 'express';
import mongoose, { type SortOrder } from 'mongoose';
import { XP_REWARDS } from '../constants/xp';
import { COACH_MODE_MIN_COMPOSITE } from '../constants/coachModes';
import { EMPATH_UNLOCK_STAMPS, PERSONA_UNLOCK_LEVEL, PERSONA_TYPES } from '../constants/personas';
import { AchievementModel } from '../models/Achievement';
import { EmotionScenarioModel } from '../models/EmotionScenario';
import { GamificationSessionModel } from '../models/Session';
import { MistakeModel } from '../models/Mistake';
import { QuestionBankModel } from '../models/QuestionBank';
import { QuizResultModel } from '../models/QuizResult';
import { UserModel } from '../models/User';
import { requireAuth } from '../middleware/auth';
import { reviewFlashcard } from '../services/flashcardService';
import { recordMicroSession, updateStreak } from '../services/streakService';
import { awardSessionXP, incrementUserXp } from '../services/xpService';
import type { AwardSessionXpInput } from '../types/xp';
import {
  coachModePutSchema,
  flashcardReviewSchema,
  microSessionSchema,
  personaPutSchema,
  quizSubmitSchema,
  scenarioCompleteSchema,
  sessionCompleteSchema,
} from '../validation/gamificationSchemas';

const router = Router();

router.use(requireAuth);

function forbid(res: Response): void {
  res.status(403).json({ error: 'Forbidden' });
}

function assertSelf(req: Request, userId: string): boolean {
  return req.gamer?.userId === userId;
}

router.post('/session/complete', async (req: Request, res: Response) => {
  try {
    const parsed = sessionCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const userId = req.gamer!.userId;
    const avgScore = (body.scores.fluency + body.scores.grammar + body.scores.eq) / 3;

    const xpInput: AwardSessionXpInput = {
      sessionId: body.sessionId,
      scores: body.scores,
      turnCount: body.turnCount,
      emotionProfile: body.emotionProfile,
      sessionCompleted: body.sessionCompleted ?? true,
      metrics: body.metrics,
    };

    const xpResult = await awardSessionXP(userId, xpInput);
    const streakResult = await updateStreak(
      userId,
      body.emotionProfile,
      body.sessionCompleted ?? true,
      avgScore
    );

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await GamificationSessionModel.findOneAndUpdate(
      { _id: body.sessionId, userId: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          endedAt: new Date(),
          scores: body.scores,
          turnCount: body.turnCount,
          emotionProfile: body.emotionProfile,
          persona: user.activePersona,
          coachMode: user.activeCoachMode,
          xpAwarded: xpResult.xpAwarded,
          resilienceBonusAwarded: streakResult.resilienceBonusAwarded,
        },
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(userId),
          startedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    const sid = new mongoose.Types.ObjectId(body.sessionId);
    for (const row of body.mistakes ?? []) {
      await MistakeModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        sessionId: sid,
        originalUtterance: row.originalUtterance,
        correctedForm: row.correctedForm,
        errorType: row.errorType,
        errorTag: row.errorTag,
        nextReviewDate: new Date(Date.now() + 86400000),
        intervalDays: 1,
        easeFactor: 2.5,
        reviewCount: 0,
      });
    }

    const u2 = await UserModel.findById(userId);
    if (u2) {
      const c = u2.levels.composite;
      if (c >= PERSONA_UNLOCK_LEVEL.storyteller && !u2.unlockedPersonas.includes('storyteller')) {
        u2.unlockedPersonas.push('storyteller');
      }
      if (c >= PERSONA_UNLOCK_LEVEL.debater && !u2.unlockedPersonas.includes('debater')) {
        u2.unlockedPersonas.push('debater');
      }
      if (u2.emotionPassport.stampCount >= EMPATH_UNLOCK_STAMPS && !u2.unlockedPersonas.includes('empath')) {
        u2.unlockedPersonas.push('empath');
      }
      if (c >= COACH_MODE_MIN_COMPOSITE.strict && !u2.unlockedCoachModes.includes('strict')) {
        u2.unlockedCoachModes.push('strict');
      }
      if (c >= COACH_MODE_MIN_COMPOSITE.debate && !u2.unlockedCoachModes.includes('debate')) {
        u2.unlockedCoachModes.push('debate');
      }
      await u2.save();
    }

    const achievements: unknown[] = [];

    res.json({
      xpAwarded: xpResult.xpAwarded,
      newLevels: xpResult.newLevels,
      levelUps: xpResult.levelUps,
      streakResult,
      achievements,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.post('/micro-session', async (req: Request, res: Response) => {
  try {
    const parsed = microSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const streakResult = await recordMicroSession(req.gamer!.userId, parsed.data.emotionProfile);
    res.json({ streakResult });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const recentAchievements = await AchievementModel.find({ userId: user._id })
      .sort({ awardedAt: -1 })
      .limit(8)
      .lean();
    res.json({ ...user, recentAchievements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/profile/self', async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.gamer!.userId).lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const recentAchievements = await AchievementModel.find({ userId: user._id })
      .sort({ awardedAt: -1 })
      .limit(8)
      .lean();
    res.json({ ...user, recentAchievements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/flashcards/due', async (req: Request, res: Response) => {
  try {
    const userId = String(req.query.userId ?? '');
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    if (!mongoose.isValidObjectId(userId) || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const now = new Date();
    const cards = await MistakeModel.find({
      userId: new mongoose.Types.ObjectId(userId),
      nextReviewDate: { $lte: now },
    })
      .sort({ nextReviewDate: 1 })
      .limit(limit)
      .lean();
    res.json({ cards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/flashcards/due/me', async (req: Request, res: Response) => {
  try {
    const userId = req.gamer!.userId;
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const now = new Date();
    const cards = await MistakeModel.find({
      userId: new mongoose.Types.ObjectId(userId),
      nextReviewDate: { $lte: now },
    })
      .sort({ nextReviewDate: 1 })
      .limit(limit)
      .lean();
    res.json({ cards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/quiz/questions', async (req: Request, res: Response) => {
  try {
    const quizType = String(req.query.quizType ?? 'grammar') as 'grammar' | 'emotion-recognition';
    if (quizType !== 'grammar' && quizType !== 'emotion-recognition') {
      res.status(400).json({ error: 'Invalid quizType' });
      return;
    }
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const questions = await QuestionBankModel.aggregate([
      { $match: { type: quizType } },
      { $sample: { size: limit } },
      {
        $project: {
          _id: 1,
          type: 1,
          difficulty: 1,
          questionText: 1,
          options: 1,
          explanation: 1,
        },
      },
    ]);
    res.json({ questions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.post('/flashcards/review', async (req: Request, res: Response) => {
  try {
    const parsed = flashcardReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { mistakeId, result } = parsed.data;
    const { card, xpAwarded } = await reviewFlashcard(req.gamer!.userId, mistakeId, result);
    if (xpAwarded > 0) {
      await incrementUserXp(req.gamer!.userId, { grammar: xpAwarded });
    }
    res.json({ card, xpAwarded });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    const code = msg === 'Card not found' ? 404 : 500;
    res.status(code).json({ error: msg });
  }
});

router.get('/scenarios', async (req: Request, res: Response) => {
  try {
    const persona = String(req.query.persona ?? 'diplomat');
    const difficulty = parseInt(String(req.query.difficulty ?? '1'), 10) as 1 | 2 | 3;
    if (!PERSONA_TYPES.includes(persona as (typeof PERSONA_TYPES)[number])) {
      res.status(400).json({ error: 'Invalid persona' });
      return;
    }
    const user = await UserModel.findById(req.gamer!.userId).lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const done = new Set(user.emotionPassport.completedScenarios.map((c) => c.scenarioId));
    const scenarios = await EmotionScenarioModel.find({
      difficulty,
      persona: { $in: [persona] },
      scenarioId: { $nin: [...done] },
    }).lean();
    res.json({ scenarios });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.post('/scenarios/complete', async (req: Request, res: Response) => {
  try {
    const parsed = scenarioCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { scenarioId, aiEqScore } = parsed.data;
    const scenario = await EmotionScenarioModel.findOne({ scenarioId }).lean();
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' });
      return;
    }

    const user = await UserModel.findById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.emotionPassport.completedScenarios.some((c) => c.scenarioId === scenarioId)) {
      res.status(400).json({ error: 'Scenario already completed' });
      return;
    }

    const extra = aiEqScore > 90 ? XP_REWARDS.SCENARIO_EXCELLENT - XP_REWARDS.SCENARIO_COMPLETE : 0;
    const a = Math.floor(extra / 3);
    const reward = {
      fluency: scenario.xpReward.fluency + a,
      grammar: scenario.xpReward.grammar + a,
      eq: scenario.xpReward.eq + (extra - 2 * a),
    };
    const xpAwarded = scenario.xpReward.fluency + scenario.xpReward.grammar + scenario.xpReward.eq + extra;

    user.emotionPassport.completedScenarios.push({
      scenarioId,
      completedAt: new Date(),
      scoreAchieved: aiEqScore,
    });
    user.emotionPassport.stampCount = Math.min(12, user.emotionPassport.stampCount + 1);

    if (user.emotionPassport.stampCount >= EMPATH_UNLOCK_STAMPS && !user.unlockedPersonas.includes('empath')) {
      user.unlockedPersonas.push('empath');
    }

    await user.save();
    await incrementUserXp(user._id.toString(), reward);

    const achievements: unknown[] = [];
    if (user.emotionPassport.stampCount > 0 && user.emotionPassport.stampCount % 3 === 0) {
      try {
        const ach = await AchievementModel.create({
          userId: user._id,
          achievementId: `passport-milestone-${user.emotionPassport.stampCount}`,
          title: 'Passport milestone',
          description: `Collected ${user.emotionPassport.stampCount} emotion passport stamps.`,
          category: 'passport',
        });
        achievements.push(ach.toObject());
      } catch (err: unknown) {
        const code = (err as { code?: number }).code;
        if (code !== 11000) throw err;
      }
    }

    res.json({
      stampEarned: true,
      newStampCount: user.emotionPassport.stampCount,
      xpAwarded,
      achievementUnlocked: achievements[0] ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const persona = String(req.query.persona ?? 'diplomat');
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const scope = String(req.query.scope ?? 'alltime') as 'weekly' | 'alltime';

    const sortField: Record<string, SortOrder> =
      scope === 'weekly' ? { 'weeklySnapshot.xpEarned': -1 } : { 'levels.composite': -1 };

    const rows = await UserModel.find({ activePersona: persona })
      .sort(sortField)
      .limit(limit)
      .select({ username: 1, activePersona: 1, levels: 1, weeklySnapshot: 1 })
      .lean();

    const entries = rows.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      compositeLevel: u.levels.composite,
      persona: u.activePersona,
      avatarInitial: u.username.charAt(0).toUpperCase(),
      weeklyXp: u.weeklySnapshot?.xpEarned ?? 0,
    }));

    res.json({ entries, scope, persona });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/streak/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const user = await UserModel.findById(userId).select({ streak: 1 }).lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const hist = [...user.streak.streakHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const last14 = hist.slice(0, 14);
    res.json({
      current: user.streak.current,
      longest: user.streak.longest,
      lastSessionDate: user.streak.lastSessionDate,
      history14: last14,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/streak/self', async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.gamer!.userId).select({ streak: 1 }).lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const hist = [...user.streak.streakHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const last14 = hist.slice(0, 14);
    res.json({
      current: user.streak.current,
      longest: user.streak.longest,
      lastSessionDate: user.streak.lastSessionDate,
      history14: last14,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.post('/quiz/submit', async (req: Request, res: Response) => {
  try {
    const parsed = quizSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { quizType, answers, sessionId } = parsed.data;
    const userId = req.gamer!.userId;
    const ids = answers.map((a) => new mongoose.Types.ObjectId(a.questionId));
    const questions = await QuestionBankModel.find({ _id: { $in: ids }, type: quizType }).lean();
    if (questions.length === 0) {
      res.status(404).json({ error: 'No questions found for submitted ids' });
      return;
    }

    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
    const graded = answers.map((a) => {
      const q = qMap.get(a.questionId);
      const correct = !!q && q.correctAnswer.trim() === a.userAnswer.trim();
      return {
        questionId: a.questionId,
        correct,
        userAnswer: a.userAnswer,
        correctAnswer: q?.correctAnswer ?? '',
      };
    });

    const correctCount = graded.filter((g) => g.correct).length;
    const total = graded.length;
    const score = total === 0 ? 0 : Math.round((100 * correctCount) / total);
    let xpAwarded = correctCount * XP_REWARDS.QUIZ_CORRECT_ANSWER;
    if (correctCount === total && total >= 10) {
      xpAwarded += XP_REWARDS.QUIZ_PERFECT_SCORE;
    }

    const sessionOid =
      sessionId && mongoose.isValidObjectId(sessionId)
        ? new mongoose.Types.ObjectId(sessionId)
        : new mongoose.Types.ObjectId();

    await QuizResultModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: sessionOid,
      quizType,
      questions: graded,
      score,
      xpAwarded,
      completedAt: new Date(),
    });

    const mistakesCreated: string[] = [];
    if (quizType === 'grammar') {
      for (const g of graded) {
        if (!g.correct) {
          const q = qMap.get(g.questionId);
          const m = await MistakeModel.create({
            userId: new mongoose.Types.ObjectId(userId),
            sessionId: sessionOid,
            originalUtterance: g.userAnswer,
            correctedForm: g.correctAnswer || '(see explanation)',
            errorType: (q?.errorType as 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other') ?? 'grammar',
            errorTag: q?.explanation?.slice(0, 120) ?? 'quiz',
            nextReviewDate: new Date(Date.now() + 86400000),
            intervalDays: 1,
            easeFactor: 2.5,
            reviewCount: 0,
          });
          mistakesCreated.push(m._id.toString());
        }
      }
    }

    const track = quizType === 'grammar' ? 'grammar' : 'eq';
    await incrementUserXp(userId, track === 'grammar' ? { grammar: xpAwarded } : { eq: xpAwarded });

    res.json({ score, correctCount, xpAwarded, mistakesCreated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/weekly-report/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const user = await UserModel.findById(userId).select({ weeklySnapshot: 1, xp: 1, levels: 1 }).lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      snapshot: user.weeklySnapshot,
      xp: user.xp,
      levels: user.levels,
      aiReportPending: !user.weeklySnapshot.aiReportText,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/weekly-report/self', async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.gamer!.userId)
      .select({ weeklySnapshot: 1, xp: 1, levels: 1 })
      .lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      snapshot: user.weeklySnapshot,
      xp: user.xp,
      levels: user.levels,
      aiReportPending: !user.weeklySnapshot.aiReportText,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.put('/persona', async (req: Request, res: Response) => {
  try {
    const parsed = personaPutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { persona } = parsed.data;
    const user = await UserModel.findById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const composite = user.levels.composite;
    const stamps = user.emotionPassport.stampCount;

    if (persona === 'storyteller' && composite >= PERSONA_UNLOCK_LEVEL.storyteller) {
      if (!user.unlockedPersonas.includes('storyteller')) user.unlockedPersonas.push('storyteller');
    }
    if (persona === 'debater' && composite >= PERSONA_UNLOCK_LEVEL.debater) {
      if (!user.unlockedPersonas.includes('debater')) user.unlockedPersonas.push('debater');
    }
    if (persona === 'empath' && stamps >= EMPATH_UNLOCK_STAMPS) {
      if (!user.unlockedPersonas.includes('empath')) user.unlockedPersonas.push('empath');
    }

    const canEmpath = stamps >= EMPATH_UNLOCK_STAMPS;
    const canStory = composite >= PERSONA_UNLOCK_LEVEL.storyteller;
    const canDebate = composite >= PERSONA_UNLOCK_LEVEL.debater;
    const allowed =
      persona === 'diplomat' ||
      (persona === 'storyteller' && canStory) ||
      (persona === 'debater' && canDebate) ||
      (persona === 'empath' && canEmpath);

    if (!allowed || !user.unlockedPersonas.includes(persona)) {
      res.status(403).json({ error: 'Persona locked' });
      return;
    }

    user.activePersona = persona;
    await user.save();
    res.json({ activePersona: user.activePersona });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.put('/coach-mode', async (req: Request, res: Response) => {
  try {
    const parsed = coachModePutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { mode } = parsed.data;
    const user = await UserModel.findById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const c = user.levels.composite;
    if (c >= COACH_MODE_MIN_COMPOSITE.strict && !user.unlockedCoachModes.includes('strict')) {
      user.unlockedCoachModes.push('strict');
    }
    if (c >= COACH_MODE_MIN_COMPOSITE.debate && !user.unlockedCoachModes.includes('debate')) {
      user.unlockedCoachModes.push('debate');
    }
    const min = COACH_MODE_MIN_COMPOSITE[mode];
    if (user.levels.composite < min || !user.unlockedCoachModes.includes(mode)) {
      res.status(403).json({ error: 'Coach mode locked' });
      return;
    }
    user.activeCoachMode = mode;
    await user.save();
    res.json({ activeCoachMode: user.activeCoachMode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

export { router as gamificationRouter };

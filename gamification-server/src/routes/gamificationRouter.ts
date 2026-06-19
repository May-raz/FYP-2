/** @deprecated Legacy Supabase router — not mounted in app.ts. Use gamificationMongoRouter instead. */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { XP_REWARDS } from '../constants/xp';
import { COACH_MODE_MIN_COMPOSITE } from '../constants/coachModes';
import { EMPATH_UNLOCK_STAMPS, PERSONA_UNLOCK_LEVEL, PERSONA_TYPES } from '../constants/personas';
import { supabase } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { reviewFlashcard } from '../services/flashcardService';
import { recordMicroSession, updateStreak } from '../services/streakService';
import { awardSessionXP, incrementUserXp } from '../services/xpService';
import type { AwardSessionXpInput } from '../types/xp';
import type { GamerUserApi, GamerUserRow } from '../types/gamer';
import { toGamerUserApi } from '../types/gamer';
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

async function getUserById(userId: string): Promise<GamerUserApi | null> {
  const { data, error } = await supabase
    .from('gamer_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle<GamerUserRow>();
  if (error) throw error;
  return data ? toGamerUserApi(data) : null;
}

function toApiMistake(row: Record<string, unknown>) {
  return {
    _id: String(row.id),
    userId: String(row.user_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    originalUtterance: String(row.original_utterance ?? ''),
    correctedForm: String(row.corrected_form ?? ''),
    errorType: String(row.error_type ?? ''),
    errorTag: String(row.error_tag ?? ''),
    nextReviewDate: row.next_review_date,
    intervalDays: Number(row.interval_days ?? 1),
    easeFactor: Number(row.ease_factor ?? 2.5),
    reviewCount: Number(row.review_count ?? 0),
    lastReviewResult: (row.last_review_result as string | null | undefined) ?? null,
  };
}

const FALLBACK_GRAMMAR_QUESTIONS = [
  {
    id: 'fallback-g-1',
    type: 'grammar',
    difficulty: 1,
    question_text: 'Choose the correct sentence.',
    options: ['She go to school every day.', 'She goes to school every day.', 'She going to school every day.'],
    correct_answer: 'She goes to school every day.',
    explanation: 'Use third-person singular verb form: goes.',
  },
  {
    id: 'fallback-g-2',
    type: 'grammar',
    difficulty: 1,
    question_text: 'Pick the correct sentence.',
    options: ['I have went there yesterday.', 'I went there yesterday.', 'I gone there yesterday.'],
    correct_answer: 'I went there yesterday.',
    explanation: 'Use simple past: went.',
  },
  {
    id: 'fallback-g-3',
    type: 'grammar',
    difficulty: 2,
    question_text: 'Complete the sentence: If I ___ more time, I would study abroad.',
    options: ['have', 'had', 'will have'],
    correct_answer: 'had',
    explanation: 'Second conditional uses past simple in the if-clause.',
  },
  {
    id: 'fallback-g-4',
    type: 'grammar',
    difficulty: 2,
    question_text: 'Choose the correct article usage.',
    options: ['She is an university student.', 'She is a university student.', 'She is the university student.'],
    correct_answer: 'She is a university student.',
    explanation: 'Use "a" before "university" because it starts with a consonant sound.',
  },
  {
    id: 'fallback-g-5',
    type: 'grammar',
    difficulty: 1,
    question_text: 'Select the best option.',
    options: ['There is many books on the table.', 'There are many books on the table.', 'There be many books on the table.'],
    correct_answer: 'There are many books on the table.',
    explanation: 'Use "are" with plural noun "books".',
  },
];

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { error: sessionError } = await supabase.from('gamer_sessions').upsert({
      id: body.sessionId,
      user_id: userId,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      scores: body.scores,
      turn_count: body.turnCount,
      emotion_profile: body.emotionProfile,
      persona: user.activePersona,
      coach_mode: user.activeCoachMode,
      xp_awarded: xpResult.xpAwarded.fluency + xpResult.xpAwarded.grammar + xpResult.xpAwarded.eq,
      resilience_bonus_awarded: streakResult.resilienceBonusAwarded,
    });
    if (sessionError) throw sessionError;

    for (const row of body.mistakes ?? []) {
      const { error: mistakeError } = await supabase.from('gamer_mistakes').insert({
        user_id: userId,
        session_id: body.sessionId,
        original_utterance: row.originalUtterance,
        corrected_form: row.correctedForm,
        error_type: row.errorType,
        error_tag: row.errorTag,
        next_review_date: new Date().toISOString(),
        interval_days: 1,
        ease_factor: 2.5,
        review_count: 0,
      });
      if (mistakeError) throw mistakeError;
    }

    const u2 = await getUserById(userId);
    if (u2) {
      const unlockedPersonas = [...u2.unlockedPersonas];
      const unlockedCoachModes = [...u2.unlockedCoachModes];
      const c = u2.levels.composite;
      if (c >= PERSONA_UNLOCK_LEVEL.storyteller && !unlockedPersonas.includes('storyteller')) {
        unlockedPersonas.push('storyteller');
      }
      if (c >= PERSONA_UNLOCK_LEVEL.debater && !unlockedPersonas.includes('debater')) {
        unlockedPersonas.push('debater');
      }
      if (u2.emotionPassport.stampCount >= EMPATH_UNLOCK_STAMPS && !unlockedPersonas.includes('empath')) {
        unlockedPersonas.push('empath');
      }
      if (c >= COACH_MODE_MIN_COMPOSITE.strict && !unlockedCoachModes.includes('strict')) {
        unlockedCoachModes.push('strict');
      }
      if (c >= COACH_MODE_MIN_COMPOSITE.debate && !unlockedCoachModes.includes('debate')) {
        unlockedCoachModes.push('debate');
      }
      const { error: unlockError } = await supabase
        .from('gamer_users')
        .update({
          unlocked_personas: unlockedPersonas,
          unlocked_coach_modes: unlockedCoachModes,
        })
        .eq('id', userId);
      if (unlockError) throw unlockError;
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

router.get('/profile/self', async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { data: recentAchievements, error: achError } = await supabase
      .from('gamer_achievements')
      .select('*')
      .eq('user_id', user._id)
      .order('awarded_at', { ascending: false })
      .limit(8);
    if (achError) throw achError;
    res.json({ ...user, recentAchievements });
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
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { data: recentAchievements, error: achError } = await supabase
      .from('gamer_achievements')
      .select('*')
      .eq('user_id', user._id)
      .order('awarded_at', { ascending: false })
      .limit(8);
    if (achError) throw achError;
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
    if (!userId || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const now = new Date();
    const { data: cards, error: cardsError } = await supabase
      .from('gamer_mistakes')
      .select('*')
      .eq('user_id', userId)
      .lte('next_review_date', now.toISOString())
      .order('next_review_date', { ascending: true })
      .limit(limit);
    if (cardsError) throw cardsError;
    res.json({ cards: (cards ?? []).map((c) => toApiMistake(c)) });
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
    const { data: cards, error: cardsError } = await supabase
      .from('gamer_mistakes')
      .select('*')
      .eq('user_id', userId)
      .lte('next_review_date', now.toISOString())
      .order('next_review_date', { ascending: true })
      .limit(limit);
    if (cardsError) throw cardsError;
    res.json({ cards: (cards ?? []).map((c) => toApiMistake(c)) });
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
    const { data: pool, error: questionError } = await supabase
      .from('gamer_questions')
      .select('id,type,difficulty,question_text,options,explanation')
      .eq('type', quizType)
      .limit(Math.max(limit * 3, limit));
    if (questionError) throw questionError;
    const shuffled = [...(pool ?? [])].sort(() => Math.random() - 0.5).slice(0, limit);
    const source = shuffled.length > 0
      ? shuffled
      : FALLBACK_GRAMMAR_QUESTIONS.slice(0, limit);
    const questions = source.map((q) => ({
      _id: q.id,
      type: q.type,
      difficulty: q.difficulty,
      questionText: q.question_text,
      options: q.options,
      explanation: q.explanation,
    }));
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
    res.json({ card: toApiMistake(card as unknown as Record<string, unknown>), xpAwarded });
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
    const user = await getUserById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const done = new Set(user.emotionPassport.completedScenarios.map((c) => c.scenarioId));
    const { data: scenarioRows, error: scenariosError } = await supabase
      .from('gamer_emotion_scenarios')
      .select('*')
      .eq('difficulty', difficulty)
      .eq('persona', persona);
    if (scenariosError) throw scenariosError;
    const scenarios = (scenarioRows ?? []).filter((s) => !done.has(String(s.scenario_id)));
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
    const { data: scenario, error: scenarioError } = await supabase
      .from('gamer_emotion_scenarios')
      .select('*')
      .eq('scenario_id', scenarioId)
      .maybeSingle();
    if (scenarioError) throw scenarioError;
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' });
      return;
    }

    const user = await getUserById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.emotionPassport.completedScenarios.some((c) => c.scenarioId === scenarioId)) {
      res.status(400).json({ error: 'Scenario already completed' });
      return;
    }

    const xpReward = (scenario.xp_reward ?? { fluency: 0, grammar: 0, eq: 0 }) as {
      fluency: number;
      grammar: number;
      eq: number;
    };
    const extra = aiEqScore > 90 ? XP_REWARDS.SCENARIO_EXCELLENT - XP_REWARDS.SCENARIO_COMPLETE : 0;
    const a = Math.floor(extra / 3);
    const reward = {
      fluency: xpReward.fluency + a,
      grammar: xpReward.grammar + a,
      eq: xpReward.eq + (extra - 2 * a),
    };
    const xpAwarded = xpReward.fluency + xpReward.grammar + xpReward.eq + extra;

    const completedScenarios = [...user.emotionPassport.completedScenarios, {
      scenarioId,
      completedAt: new Date().toISOString(),
      scoreAchieved: aiEqScore,
    }];
    const stampCount = Math.min(12, user.emotionPassport.stampCount + 1);
    const unlockedPersonas = [...user.unlockedPersonas];

    if (stampCount >= EMPATH_UNLOCK_STAMPS && !unlockedPersonas.includes('empath')) {
      unlockedPersonas.push('empath');
    }

    const { error: updateError } = await supabase
      .from('gamer_users')
      .update({
        passport_completed: completedScenarios,
        passport_stamp_count: stampCount,
        unlocked_personas: unlockedPersonas,
      })
      .eq('id', req.gamer!.userId);
    if (updateError) throw updateError;
    await incrementUserXp(req.gamer!.userId, reward);

    const achievements: unknown[] = [];
    if (stampCount > 0 && stampCount % 3 === 0) {
      try {
        const { data: ach, error: achError } = await supabase
          .from('gamer_achievements')
          .insert({
          user_id: req.gamer!.userId,
          achievement_id: `passport-milestone-${stampCount}`,
          title: 'Passport milestone',
          description: `Collected ${stampCount} emotion passport stamps.`,
          category: 'passport',
          })
          .select('*')
          .single();
        if (achError) throw achError;
        achievements.push(ach);
      } catch {
        // ignore duplicate achievement insert
      }
    }

    res.json({
      stampEarned: true,
      newStampCount: stampCount,
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

    const orderColumn = scope === 'weekly' ? 'weekly_xp_earned' : 'level_composite';
    const { data: rows, error: rowsError } = await supabase
      .from('gamer_users')
      .select('*')
      .eq('active_persona', persona)
      .not('username', 'ilike', 'test%')
      .not('username', 'ilike', 'demo%')
      .order(orderColumn, { ascending: false })
      .limit(limit);
    if (rowsError) throw rowsError;

    const entries = (rows ?? []).map((u, i) => ({
      rank: i + 1,
      username: u.username,
      compositeLevel: u.level_composite,
      persona: u.active_persona,
      avatarInitial: u.username.charAt(0).toUpperCase(),
      weeklyXp: u.weekly_xp_earned ?? 0,
    }));

    res.json({ entries, scope, persona });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/streak/self', async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.gamer!.userId);
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

router.get('/streak/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const user = await getUserById(userId);
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
    const ids = answers.map((a) => String(a.questionId));
    const dbIds = ids.filter((id) => isUuidLike(id));
    const fallbackPool = quizType === 'grammar' ? FALLBACK_GRAMMAR_QUESTIONS : [];
    const fallbackMap = new Map(
      fallbackPool
        .filter((q) => ids.includes(String(q.id)))
        .map((q) => [String(q.id), q])
    );

    let questionRows: any[] = [];
    if (dbIds.length > 0) {
      const { data: questions, error: questionError } = await supabase
        .from('gamer_questions')
        .select('*')
        .in('id', dbIds)
        .eq('type', quizType);
      if (questionError) throw questionError;
      questionRows = Array.isArray(questions) ? questions : [];
    }

    if (questionRows.length === 0 && fallbackMap.size === 0) {
      res.status(404).json({ error: 'No questions found for submitted ids' });
      return;
    }

    const qMap = new Map(questionRows.map((q) => [String(q.id), q]));
    for (const [k, v] of fallbackMap.entries()) {
      qMap.set(k, v);
    }
    const graded = answers.map((a) => {
      const q = qMap.get(String(a.questionId));
      const correct = !!q && String(q.correct_answer).trim() === a.userAnswer.trim();
      return {
        questionId: a.questionId,
        correct,
        userAnswer: a.userAnswer,
        correctAnswer: q?.correct_answer ?? '',
      };
    });

    const correctCount = graded.filter((g) => g.correct).length;
    const total = graded.length;
    const score = total === 0 ? 0 : Math.round((100 * correctCount) / total);
    let xpAwarded = correctCount * XP_REWARDS.QUIZ_CORRECT_ANSWER;
    if (correctCount === total && total >= 10) {
      xpAwarded += XP_REWARDS.QUIZ_PERFECT_SCORE;
    }

    const sessionRef = sessionId ?? crypto.randomUUID();

    const { error: quizResultError } = await supabase.from('gamer_quiz_results').insert({
      user_id: userId,
      session_id: sessionRef,
      quiz_type: quizType,
      questions: graded,
      score,
      xp_awarded: xpAwarded,
      completed_at: new Date().toISOString(),
    });
    if (quizResultError) throw quizResultError;

    const mistakesCreated: string[] = [];
    if (quizType === 'grammar') {
      for (const g of graded) {
        if (!g.correct) {
          const q = qMap.get(String(g.questionId));
          const { data: m, error: insertError } = await supabase
            .from('gamer_mistakes')
            .insert({
              user_id: userId,
              session_id: sessionRef,
              original_utterance: g.userAnswer,
              corrected_form: g.correctAnswer || '(see explanation)',
              error_type:
                (q?.error_type as 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other') ?? 'grammar',
              error_tag: (q?.explanation as string | undefined)?.slice(0, 120) ?? 'quiz',
              next_review_date: new Date().toISOString(),
              interval_days: 1,
              ease_factor: 2.5,
              review_count: 0,
            })
            .select('id')
            .single();
          if (insertError) throw insertError;
          if (m?.id) mistakesCreated.push(m.id);
        }
      }
    }

    const track = quizType === 'grammar' ? 'grammar' : 'eq';
    await incrementUserXp(userId, track === 'grammar' ? { grammar: xpAwarded } : { eq: xpAwarded });

    res.json({ score, correctCount, xpAwarded, mistakesCreated });
  } catch (e: any) {
    const msg =
      (typeof e?.message === 'string' && e.message) ||
      (typeof e?.error_description === 'string' && e.error_description) ||
      (typeof e?.details === 'string' && e.details) ||
      'Server error';
    console.error('[quiz/submit] failed', {
      message: msg,
      code: e?.code,
      hint: e?.hint,
      details: e?.details,
    });
    res.status(500).json({
      error: msg,
      code: e?.code ?? null,
      detail: e?.details ?? e?.hint ?? null,
    });
  }
});

router.get('/weekly-report/self', async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.gamer!.userId);
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

router.get('/weekly-report/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId || !assertSelf(req, userId)) {
      forbid(res);
      return;
    }
    const user = await getUserById(userId);
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
    const user = await getUserById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const composite = user.levels.composite;
    const stamps = user.emotionPassport.stampCount;

    const unlockedPersonas = [...user.unlockedPersonas];
    if (persona === 'storyteller' && composite >= PERSONA_UNLOCK_LEVEL.storyteller) {
      if (!unlockedPersonas.includes('storyteller')) unlockedPersonas.push('storyteller');
    }
    if (persona === 'debater' && composite >= PERSONA_UNLOCK_LEVEL.debater) {
      if (!unlockedPersonas.includes('debater')) unlockedPersonas.push('debater');
    }
    if (persona === 'empath' && stamps >= EMPATH_UNLOCK_STAMPS) {
      if (!unlockedPersonas.includes('empath')) unlockedPersonas.push('empath');
    }

    const canEmpath = stamps >= EMPATH_UNLOCK_STAMPS;
    const canStory = composite >= PERSONA_UNLOCK_LEVEL.storyteller;
    const canDebate = composite >= PERSONA_UNLOCK_LEVEL.debater;
    const allowed =
      persona === 'diplomat' ||
      (persona === 'storyteller' && canStory) ||
      (persona === 'debater' && canDebate) ||
      (persona === 'empath' && canEmpath);

    if (!allowed || !unlockedPersonas.includes(persona)) {
      res.status(403).json({ error: 'Persona locked' });
      return;
    }

    const { error: updateError } = await supabase
      .from('gamer_users')
      .update({
        unlocked_personas: unlockedPersonas,
        active_persona: persona,
      })
      .eq('id', req.gamer!.userId);
    if (updateError) throw updateError;
    res.json({ activePersona: persona });
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
    const user = await getUserById(req.gamer!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const c = user.levels.composite;
    const unlockedCoachModes = [...user.unlockedCoachModes];
    if (c >= COACH_MODE_MIN_COMPOSITE.strict && !unlockedCoachModes.includes('strict')) {
      unlockedCoachModes.push('strict');
    }
    if (c >= COACH_MODE_MIN_COMPOSITE.debate && !unlockedCoachModes.includes('debate')) {
      unlockedCoachModes.push('debate');
    }
    const min = COACH_MODE_MIN_COMPOSITE[mode];
    if (user.levels.composite < min || !unlockedCoachModes.includes(mode)) {
      res.status(403).json({ error: 'Coach mode locked' });
      return;
    }
    const { error: updateError } = await supabase
      .from('gamer_users')
      .update({
        unlocked_coach_modes: unlockedCoachModes,
        active_coach_mode: mode,
      })
      .eq('id', req.gamer!.userId);
    if (updateError) throw updateError;
    res.json({ activeCoachMode: mode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error';
    res.status(500).json({ error: msg });
  }
});

export { router as gamificationRouter };

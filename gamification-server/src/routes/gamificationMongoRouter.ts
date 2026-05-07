import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth';
import { XP_REWARDS, XP_THRESHOLDS } from '../constants/xp';
import { UserModel } from '../models/User';
import { MistakeModel } from '../models/Mistake';
import { QuestionBankModel } from '../models/QuestionBank';
import { QuizResultModel } from '../models/QuizResult';
import { GamificationSessionModel } from '../models/Session';

const router = Router();
router.use(requireAuth);

const FALLBACK_GRAMMAR_QUESTIONS = [
  { id: 'fallback-g-1', type: 'grammar', difficulty: 1, question_text: 'Choose the correct sentence.', options: ['She go to school every day.', 'She goes to school every day.', 'She going to school every day.'], correct_answer: 'She goes to school every day.', explanation: 'Use third-person singular verb form: goes.' },
  { id: 'fallback-g-2', type: 'grammar', difficulty: 1, question_text: 'Pick the correct sentence.', options: ['I have went there yesterday.', 'I went there yesterday.', 'I gone there yesterday.'], correct_answer: 'I went there yesterday.', explanation: 'Use simple past: went.' },
  { id: 'fallback-g-3', type: 'grammar', difficulty: 2, question_text: 'Complete the sentence: If I ___ more time, I would study abroad.', options: ['have', 'had', 'will have'], correct_answer: 'had', explanation: 'Second conditional uses past simple in the if-clause.' },
  { id: 'fallback-g-4', type: 'grammar', difficulty: 2, question_text: 'Choose the correct article usage.', options: ['She is an university student.', 'She is a university student.', 'She is the university student.'], correct_answer: 'She is a university student.', explanation: 'Use "a" before "university" because it starts with a consonant sound.' },
  { id: 'fallback-g-5', type: 'grammar', difficulty: 1, question_text: 'Select the best option.', options: ['There is many books on the table.', 'There are many books on the table.', 'There be many books on the table.'], correct_answer: 'There are many books on the table.', explanation: 'Use "are" with plural noun "books".' },
];

function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (xp >= XP_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(10, Math.max(1, level));
}

function toCard(m: any) {
  return {
    _id: String(m._id),
    userId: String(m.userId),
    sessionId: m.sessionId ? String(m.sessionId) : null,
    originalUtterance: m.originalUtterance,
    correctedForm: m.correctedForm,
    errorType: m.errorType,
    errorTag: m.errorTag,
    nextReviewDate: m.nextReviewDate,
    intervalDays: m.intervalDays,
    easeFactor: m.easeFactor,
    reviewCount: m.reviewCount,
    lastReviewResult: m.lastReviewResult ?? null,
  };
}

router.get('/profile/self', async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.gamer!.userId).lean();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

router.get('/streak/self', async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.gamer!.userId).lean();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    current: user.streak?.current ?? 0,
    longest: user.streak?.longest ?? 0,
    lastSessionDate: user.streak?.lastSessionDate ?? null,
    history14: (user.streak?.streakHistory ?? []).slice(-14),
  });
});

router.get('/leaderboard', async (req: Request, res: Response) => {
  const persona = String(req.query.persona ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const query = persona ? { activePersona: persona } : {};
  const users = await UserModel.find(query).sort({ 'weeklySnapshot.xpEarned': -1, 'levels.composite': -1 }).limit(limit).lean();
  const entries = users.map((u, idx) => ({
    rank: idx + 1,
    userId: String(u._id),
    username: u.username,
    compositeLevel: u.levels?.composite ?? 1,
    xpEarned: u.weeklySnapshot?.xpEarned ?? 0,
  }));
  res.json({ entries });
});

router.get('/flashcards/due/me', async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
  const cards = await MistakeModel.find({
    userId: new mongoose.Types.ObjectId(req.gamer!.userId),
    nextReviewDate: { $lte: new Date() },
  })
    .sort({ nextReviewDate: 1 })
    .limit(limit)
    .lean();
  res.json({ cards: cards.map(toCard) });
});

router.post('/flashcards/review', async (req: Request, res: Response) => {
  const mistakeId = String(req.body?.mistakeId ?? '').trim();
  const result = String(req.body?.result ?? '').trim();
  if (!mistakeId || !['correct', 'incorrect', 'skipped'].includes(result)) {
    res.status(400).json({ error: 'Invalid review payload' });
    return;
  }
  const card = await MistakeModel.findOne({ _id: mistakeId, userId: req.gamer!.userId });
  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  let xpAwarded = 0;
  if (result === 'incorrect') {
    card.intervalDays = 1;
    card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
  } else if (result === 'correct') {
    xpAwarded = card.reviewCount === 0 ? XP_REWARDS.FLASHCARD_FIRST_TRY : XP_REWARDS.FLASHCARD_CORRECT;
    card.easeFactor = Math.min(3, card.easeFactor + 0.1);
    card.intervalDays = Math.max(1, Math.round(card.intervalDays * card.easeFactor));
  }
  card.reviewCount += 1;
  card.lastReviewResult = result === 'skipped' ? null : result;
  card.nextReviewDate = new Date(Date.now() + card.intervalDays * 86400000);
  await card.save();
  if (xpAwarded > 0) {
    const user = await UserModel.findById(req.gamer!.userId);
    if (user) {
      user.xp.grammar += xpAwarded;
      user.levels.grammar = levelFromXp(user.xp.grammar);
      user.levels.composite = Math.max(1, Math.floor((user.levels.fluency + user.levels.grammar + user.levels.eq) / 3));
      user.weeklySnapshot.xpEarned += xpAwarded;
      await user.save();
    }
  }
  res.json({ card: toCard(card.toObject()), xpAwarded });
});

router.get('/quiz/questions', async (req: Request, res: Response) => {
  const quizType = String(req.query.quizType ?? 'grammar');
  const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
  const pool = await QuestionBankModel.find({ type: quizType }).limit(Math.max(limit * 3, limit)).lean();
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, limit);
  const source = shuffled.length > 0 ? shuffled : FALLBACK_GRAMMAR_QUESTIONS.slice(0, limit);
  const questions = source.map((q: any) => ({
    _id: String(q._id ?? q.id),
    type: q.type,
    difficulty: q.difficulty,
    questionText: q.questionText ?? q.question_text,
    options: q.options,
    explanation: q.explanation,
  }));
  res.json({ questions });
});

router.post('/quiz/submit', async (req: Request, res: Response) => {
  try {
    const quizType = String(req.body?.quizType ?? '');
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (!quizType || answers.length === 0) {
      res.status(400).json({ error: 'Invalid quiz payload' });
      return;
    }
    const userId = new mongoose.Types.ObjectId(req.gamer!.userId);
    const ids = answers.map((a: any) => String(a.questionId));
    const dbQuestions = await QuestionBankModel.find({ _id: { $in: ids.filter((id: string) => mongoose.isValidObjectId(id)) } }).lean();
    const fallbackMap = new Map(FALLBACK_GRAMMAR_QUESTIONS.filter((q) => ids.includes(q.id)).map((q) => [q.id, q]));
    const qMap = new Map(dbQuestions.map((q: any) => [String(q._id), q]));
    for (const [k, v] of fallbackMap.entries()) qMap.set(k, v as any);
    const graded = answers.map((a: any) => {
      const q: any = qMap.get(String(a.questionId));
      const correctAnswer = String(q?.correctAnswer ?? q?.correct_answer ?? '');
      return {
        questionId: String(a.questionId),
        questionText: String(q?.questionText ?? q?.question_text ?? ''),
        correct: !!q && correctAnswer.trim() === String(a.userAnswer ?? '').trim(),
        userAnswer: String(a.userAnswer ?? ''),
        correctAnswer,
        explanation: String(q?.explanation ?? ''),
      };
    });
    const correctCount = graded.filter((g: any) => g.correct).length;
    const score = Math.round((100 * correctCount) / Math.max(1, graded.length));
    let xpAwarded = correctCount * XP_REWARDS.QUIZ_CORRECT_ANSWER;
    if (correctCount === graded.length && graded.length >= 10) xpAwarded += XP_REWARDS.QUIZ_PERFECT_SCORE;

    const sessionId = mongoose.isValidObjectId(req.body?.sessionId)
      ? new mongoose.Types.ObjectId(String(req.body.sessionId))
      : new mongoose.Types.ObjectId();

    await QuizResultModel.create({
      userId,
      sessionId,
      quizType,
      questions: graded,
      score,
      xpAwarded,
      completedAt: new Date(),
    });

    const mistakesCreated: string[] = [];
    if (quizType === 'grammar') {
      for (const g of graded.filter((x: any) => !x.correct)) {
        const created = await MistakeModel.create({
          userId,
          sessionId,
          originalUtterance: g.userAnswer,
          correctedForm: g.correctAnswer || '(see explanation)',
          errorType: 'grammar',
          errorTag: 'quiz',
          nextReviewDate: new Date(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 0,
        });
        mistakesCreated.push(String(created._id));
      }
    }

    const user = await UserModel.findById(userId);
    if (user) {
      if (quizType === 'grammar') user.xp.grammar += xpAwarded;
      else user.xp.eq += xpAwarded;
      user.levels.grammar = levelFromXp(user.xp.grammar);
      user.levels.eq = levelFromXp(user.xp.eq);
      user.levels.composite = Math.max(1, Math.floor((user.levels.fluency + user.levels.grammar + user.levels.eq) / 3));
      user.weeklySnapshot.xpEarned += xpAwarded;
      await user.save();
    }

    res.json({ score, correctCount, xpAwarded, mistakesCreated, graded });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

router.post('/micro-session', async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.gamer!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const today = new Date();
  const last = user.streak.lastSessionDate ? new Date(user.streak.lastSessionDate) : null;
  const dayNow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).getTime();
  const dayLast = last ? new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())).getTime() : null;
  if (dayLast === null) user.streak.current = 1;
  else if (dayLast === dayNow) user.streak.current = user.streak.current;
  else if (dayLast === dayNow - 86400000) user.streak.current += 1;
  else user.streak.current = 1;
  user.streak.longest = Math.max(user.streak.longest, user.streak.current);
  user.streak.lastSessionDate = today;
  await user.save();
  res.json({ current: user.streak.current, longest: user.streak.longest, sameDaySession: dayLast === dayNow });
});

router.post('/session/complete', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const user = await UserModel.findById(req.gamer!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const scores = body.scores ?? { fluency: 0, grammar: 0, eq: 0 };
  const turnCount = Math.max(0, Number(body.turnCount ?? 0));
  const fluXp = Math.max(0, Math.round((Number(scores.fluency ?? 0) / 10) * turnCount));
  const graXp = Math.max(0, Math.round((Number(scores.grammar ?? 0) / 10) * turnCount));
  const eqXp = Math.max(0, Math.round((Number(scores.eq ?? 0) / 10) * turnCount));
  user.xp.fluency += fluXp;
  user.xp.grammar += graXp;
  user.xp.eq += eqXp;
  user.levels.fluency = levelFromXp(user.xp.fluency);
  user.levels.grammar = levelFromXp(user.xp.grammar);
  user.levels.eq = levelFromXp(user.xp.eq);
  user.levels.composite = Math.max(1, Math.floor((user.levels.fluency + user.levels.grammar + user.levels.eq) / 3));
  user.weeklySnapshot.sessionsCompleted += 1;
  user.weeklySnapshot.xpEarned += fluXp + graXp + eqXp;
  await user.save();

  await GamificationSessionModel.create({
    userId: user._id,
    startedAt: new Date(),
    endedAt: new Date(),
    persona: user.activePersona,
    coachMode: user.activeCoachMode,
    scores: { fluency: Number(scores.fluency ?? 0), grammar: Number(scores.grammar ?? 0), eq: Number(scores.eq ?? 0) },
    xpAwarded: { fluency: fluXp, grammar: graXp, eq: eqXp },
    emotionProfile: body.emotionProfile ?? { dominant: 'neutral', anxietyFlag: false },
    resilienceBonusAwarded: Boolean(body.emotionProfile?.anxietyFlag),
    turnCount,
  });

  const mistakes = Array.isArray(body.mistakes) ? body.mistakes : [];
  for (const m of mistakes) {
    await MistakeModel.create({
      userId: user._id,
      sessionId: null,
      originalUtterance: String(m.originalUtterance ?? ''),
      correctedForm: String(m.correctedForm ?? ''),
      errorType: m.errorType ?? 'grammar',
      errorTag: String(m.errorTag ?? 'session'),
      nextReviewDate: new Date(),
      intervalDays: 1,
      easeFactor: 2.5,
      reviewCount: 0,
    });
  }

  res.json({
    xpAwarded: { fluency: fluXp, grammar: graXp, eq: eqXp },
    newLevels: user.levels,
    levelUps: [],
    streakResult: { current: user.streak.current, longest: user.streak.longest, resilienceBonusAwarded: false, sameDaySession: false },
    achievements: [],
  });
});

export const gamificationMongoRouter = router;


import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth';
import { XP_REWARDS, XP_THRESHOLDS } from '../constants/xp';
import { UserModel } from '../models/User';
import { MistakeModel } from '../models/Mistake';
import { QuestionBankModel } from '../models/QuestionBank';
import { QuizResultModel } from '../models/QuizResult';
import { GamificationSessionModel } from '../models/Session';
import { runFullDemoSeed, isJunkMistake } from '../services/demoSeedService';
import {
  ensureQuestionBankSeeded,
  generateFlashcardsWithLlm,
  getRecentQuizQuestionTexts,
  getShuffledDemoDeck,
  DEMO_GRAMMAR_QUESTIONS,
  isLowValueCard,
  persistFlashcards,
} from '../services/learningContentService';

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

type CanonicalReviewResult = 'easy' | 'medium' | 'hard' | 'incorrect' | 'skipped';
type AcceptedReviewResult = CanonicalReviewResult | 'correct';
type CardKind =
  | 'vocabulary_review'
  | 'pronunciation_review'
  | 'grammar_correction'
  | 'sentence_improvement'
  | 'contextual_usage';

export function normalizeReviewResult(input: string): CanonicalReviewResult | null {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'correct') return 'medium';
  if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'incorrect' || value === 'skipped') return value;
  return null;
}

export function classifyCardType(errorType: string, original: string, corrected: string): CardKind {
  const cleanOriginal = String(original || '').trim().toLowerCase();
  const cleanCorrected = String(corrected || '').trim().toLowerCase();
  const changed = cleanOriginal !== cleanCorrected;
  if (errorType === 'grammar') return 'grammar_correction';
  if (errorType === 'vocabulary') return changed ? 'vocabulary_review' : 'contextual_usage';
  if (errorType === 'tense' || errorType === 'agreement') return 'sentence_improvement';
  return changed ? 'contextual_usage' : 'pronunciation_review';
}

export function deriveCardInsights(m: any) {
  const original = String(m.originalUtterance ?? '').trim();
  const corrected = String(m.correctedForm ?? '').trim();
  const normalizedOriginal = original.toLowerCase();
  const normalizedCorrected = corrected.toLowerCase();
  const correctionChanged = normalizedOriginal !== normalizedCorrected;
  const tokenDiff = (() => {
    const o = normalizedOriginal.split(/\s+/).filter(Boolean);
    const c = normalizedCorrected.split(/\s+/).filter(Boolean);
    const added = c.filter((w: string) => !o.includes(w));
    const removed = o.filter((w: string) => !c.includes(w));
    return { added, removed };
  })();
  const focusWord =
    tokenDiff.added[0]
    || tokenDiff.removed[0]
    || corrected.split(/\s+/).find((w: string) => w.length > 4)
    || original.split(/\s+/).find((w: string) => w.length > 4)
    || '';
  const cardType = classifyCardType(String(m.errorType ?? 'other'), original, corrected);
  const errorReason = (() => {
    if (!correctionChanged) return 'Pronunciation or clarity issue detected in recent conversation.';
    if (m.errorType === 'grammar') return 'Grammar structure needed adjustment for natural English.';
    if (m.errorType === 'tense') return 'Verb tense was inconsistent with the sentence context.';
    if (m.errorType === 'agreement') return 'Subject-verb agreement needed correction.';
    if (m.errorType === 'vocabulary') return 'Word choice could be improved for clearer meaning.';
    return 'Sentence can be improved for clarity and correctness.';
  })();

  return { original, corrected, cardType, focusWord, errorReason, tokenDiff };
}

function subtypeToCardType(subtype: string): CardKind {
  const map: Record<string, CardKind> = {
    vocabulary: 'vocabulary_review',
    pronunciation: 'pronunciation_review',
    grammar_correction: 'grammar_correction',
    sentence_improvement: 'sentence_improvement',
    fill_blank: 'grammar_correction',
    choose_sentence: 'grammar_correction',
    contextual: 'contextual_usage',
  };
  return map[subtype] ?? 'grammar_correction';
}

function isMeaningfulCard(m: any): boolean {
  if (isJunkMistake(m)) return false;
  const front = String(m.cardFront ?? '').trim();
  const back = String(m.cardBack ?? '').trim();
  if (front && back && front !== back) return true;
  const original = String(m.originalUtterance ?? '').trim();
  const corrected = String(m.correctedForm ?? '').trim();
  return !isLowValueCard(original, corrected);
}

function toCard(m: any) {
  const { original, corrected, cardType, focusWord, errorReason, tokenDiff } = deriveCardInsights(m);
  const storedFront = String(m.cardFront ?? '').trim();
  const storedBack = String(m.cardBack ?? '').trim();
  const storedExplanation = String(m.cardExplanation ?? '').trim();
  const resolvedSubtype = String(m.cardSubtype ?? '').trim();
  const resolvedCardType = resolvedSubtype ? subtypeToCardType(resolvedSubtype) : cardType;
  const displayFront = storedFront || (resolvedCardType === 'pronunciation_review' && focusWord
    ? `Pronounce: ${focusWord}`
    : original !== corrected
      ? `Improve: "${original}"`
      : storedFront || original);
  const displayBack = storedBack || corrected;
  const displayExplanation = storedExplanation || errorReason;
  return {
    _id: String(m._id),
    userId: String(m.userId),
    sessionId: m.sessionId ? String(m.sessionId) : null,
    originalUtterance: original,
    correctedForm: corrected,
    errorType: m.errorType,
    errorTag: m.errorTag,
    nextReviewDate: m.nextReviewDate,
    intervalDays: m.intervalDays,
    easeFactor: m.easeFactor,
    reviewCount: m.reviewCount,
    lastReviewResult: m.lastReviewResult ?? null,
    cardType: resolvedCardType,
    cardSubtype: resolvedSubtype || resolvedCardType,
    focusWord: String(m.focusWord ?? focusWord ?? ''),
    cardFront: displayFront,
    cardBack: displayBack,
    cardExplanation: displayExplanation,
    cardOptions: Array.isArray(m.cardOptions) ? m.cardOptions.map(String) : [],
    whatIncorrect: displayFront,
    whyIncorrect: displayExplanation,
    correctedSentence: displayBack,
    improvedPhrasing: displayBack,
    addedWords: tokenDiff.added.slice(0, 4),
    removedWords: tokenDiff.removed.slice(0, 4),
  };
}

export function computePriorityScore(card: any, now = new Date()): number {
  const dueAt = new Date(card.nextReviewDate ?? now);
  const overdueHours = Math.max(0, (now.getTime() - dueAt.getTime()) / 3600000);
  const eased = Number(card.easeFactor ?? 2.5);
  const reviews = Number(card.reviewCount ?? 0);
  let score = 0;
  score += Math.max(0, 3 - eased) * 40; // low memory strength
  score += Math.min(72, overdueHours) * 0.7; // overdue urgency
  score += Math.min(20, reviews) * 1.2; // recurring issue
  if (card.lastReviewResult === 'incorrect') score += 35;
  if (card.lastReviewResult === 'hard') score += 24;
  if (card.cardType === 'pronunciation_review') score += 10;
  return Number(score.toFixed(2));
}

export function computeReviewOutcome(
  current: { intervalDays: number; easeFactor: number },
  rawResult: AcceptedReviewResult
) {
  const result = normalizeReviewResult(rawResult);
  if (!result) throw new Error('Invalid review result');
  const intervalDays = Math.max(1, Math.round(Number(current.intervalDays || 1)));
  const easeFactor = Math.max(1.3, Math.min(3, Number(current.easeFactor || 2.5)));
  if (result === 'skipped') {
    return {
      result,
      intervalDays,
      easeFactor,
      nextReviewDate: new Date(Date.now() + 6 * 3600000),
    };
  }
  if (result === 'incorrect') {
    return {
      result,
      intervalDays: 1,
      easeFactor: Math.max(1.3, Number((easeFactor - 0.2).toFixed(2))),
      nextReviewDate: new Date(Date.now() + 2 * 3600000),
    };
  }
  if (result === 'hard') {
    const nextInterval = Math.max(1, Math.round(intervalDays * 0.6));
    return {
      result,
      intervalDays: nextInterval,
      easeFactor: Math.max(1.3, Number((easeFactor - 0.08).toFixed(2))),
      nextReviewDate: new Date(Date.now() + 12 * 3600000),
    };
  }
  if (result === 'easy') {
    const nextEase = Math.min(3, Number((easeFactor + 0.15).toFixed(2)));
    const nextInterval = Math.max(intervalDays + 2, Math.round(intervalDays * (easeFactor + 0.55)));
    return {
      result,
      intervalDays: nextInterval,
      easeFactor: nextEase,
      nextReviewDate: new Date(Date.now() + nextInterval * 86400000),
    };
  }
  const nextEase = Math.min(3, Number((easeFactor + 0.05).toFixed(2)));
  const nextInterval = Math.max(intervalDays + 1, Math.round(intervalDays * (easeFactor + 0.2)));
  return {
    result,
    intervalDays: nextInterval,
    easeFactor: nextEase,
    nextReviewDate: new Date(Date.now() + nextInterval * 86400000),
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
  const userId = new mongoose.Types.ObjectId(req.gamer!.userId);

  let cards = await MistakeModel.find({
    userId,
    nextReviewDate: { $lte: new Date() },
  })
    .sort({ nextReviewDate: 1, reviewCount: -1, easeFactor: 1 })
    .limit(Math.max(limit * 3, limit))
    .lean();

  const meaningful = cards.filter(isMeaningfulCard);
  if (meaningful.length < Math.min(4, limit)) {
    await persistFlashcards(userId, getShuffledDemoDeck(Math.max(8, limit)));
    cards = await MistakeModel.find({
      userId,
      nextReviewDate: { $lte: new Date() },
    })
      .sort({ nextReviewDate: 1, reviewCount: -1, easeFactor: 1 })
      .limit(Math.max(limit * 3, limit))
      .lean();
  }

  const enriched = cards.filter(isMeaningfulCard).map(toCard);
  const prioritized = enriched
    .sort((a: any, b: any) => computePriorityScore(b) - computePriorityScore(a))
    .slice(0, limit);
  const summary = {
    totalDue: enriched.length,
    pronunciationDue: prioritized.filter((c: any) => c.cardType === 'pronunciation_review').length,
    grammarDue: prioritized.filter((c: any) => c.cardType === 'grammar_correction').length,
    highPriority: prioritized.filter((c: any) => (c.lastReviewResult === 'incorrect' || c.lastReviewResult === 'hard')).length,
  };
  res.json({ cards: prioritized, summary });
});

router.post('/flashcards/generate', async (req: Request, res: Response) => {
  const userId = new mongoose.Types.ObjectId(req.gamer!.userId);
  const limit = Math.min(15, Math.max(4, parseInt(String(req.body?.limit ?? '8'), 10) || 8));
  const mistakesFromSession = Array.isArray(req.body?.mistakes)
    ? req.body.mistakes.map((m: any) => ({
        original: m.original ?? m.originalUtterance,
        corrected: m.corrected ?? m.correctedForm,
        type: m.type ?? m.errorType,
        explanation: m.explanation ?? m.cardExplanation,
        word: m.word ?? m.focusWord,
      }))
    : [];

  const recentMistakes = await MistakeModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const mergedMistakes = [
    ...mistakesFromSession,
    ...recentMistakes
      .filter((m) => !isLowValueCard(String(m.originalUtterance), String(m.correctedForm)))
      .map((m) => ({
        original: m.originalUtterance,
        corrected: m.correctedForm,
        type: m.errorType,
        explanation: m.cardExplanation,
        word: m.focusWord,
      })),
  ];

  const useDemoOnly = Boolean(req.body?.demoOnly) || mergedMistakes.length === 0;
  const generated = useDemoOnly
    ? getShuffledDemoDeck(limit)
    : await generateFlashcardsWithLlm({
        userId: String(userId),
        mistakesFromSession: mergedMistakes,
        recentChat: Array.isArray(req.body?.recentChat) ? req.body.recentChat : [],
        limit,
      });
  const createdIds = await persistFlashcards(userId, generated);
  const created = await MistakeModel.find({ _id: { $in: createdIds } }).lean();
  res.json({
    createdCount: createdIds.length,
    cards: created.map(toCard),
    source: useDemoOnly ? 'default_bank' : (mergedMistakes.length > 0 ? 'user_history' : 'default_bank'),
  });
});

router.post('/flashcards/reset-demo', async (req: Request, res: Response) => {
  const userId = new mongoose.Types.ObjectId(req.gamer!.userId);
  const limit = Math.min(25, Math.max(15, parseInt(String(req.body?.limit ?? '20'), 10) || 20));
  const userCards = await MistakeModel.find({ userId }).lean();
  const junkIds = userCards.filter(isJunkMistake).map((m) => m._id);
  if (junkIds.length) await MistakeModel.deleteMany({ _id: { $in: junkIds } });
  const createdIds = await persistFlashcards(userId, getShuffledDemoDeck(limit));
  const created = await MistakeModel.find({ _id: { $in: createdIds } }).lean();
  res.json({
    removedJunk: junkIds.length,
    createdCount: createdIds.length,
    cards: created.map(toCard),
  });
});

router.post('/flashcards/review', async (req: Request, res: Response) => {
  const mistakeId = String(req.body?.mistakeId ?? '').trim();
  const normalizedResult = normalizeReviewResult(String(req.body?.result ?? '').trim());
  if (!mistakeId || !normalizedResult) {
    res.status(400).json({ error: 'Invalid review payload' });
    return;
  }
  const card = await MistakeModel.findOne({ _id: mistakeId, userId: req.gamer!.userId });
  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  let xpAwarded = 0;
  const reviewOutcome = computeReviewOutcome(
    { intervalDays: card.intervalDays, easeFactor: card.easeFactor },
    normalizedResult
  );
  if (reviewOutcome.result === 'easy') {
    xpAwarded = card.reviewCount === 0 ? XP_REWARDS.FLASHCARD_FIRST_TRY : XP_REWARDS.FLASHCARD_CORRECT;
  } else if (reviewOutcome.result === 'medium') {
    xpAwarded = XP_REWARDS.FLASHCARD_CORRECT;
  }
  card.intervalDays = reviewOutcome.intervalDays;
  card.easeFactor = reviewOutcome.easeFactor;
  card.reviewCount += 1;
  card.lastReviewResult = reviewOutcome.result === 'skipped' ? null : reviewOutcome.result;
  card.nextReviewDate = reviewOutcome.nextReviewDate;
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
  res.json({ card: toCard(card.toObject()), xpAwarded, resultApplied: reviewOutcome.result });
});

router.get('/quiz/questions', async (req: Request, res: Response) => {
  const quizType = String(req.query.quizType ?? 'grammar');
  const limit = Math.min(15, Math.max(10, parseInt(String(req.query.limit ?? '10'), 10) || 10));
  const difficulty = Math.min(3, Math.max(1, parseInt(String(req.query.difficulty ?? '0'), 10) || 0));
  const userId = new mongoose.Types.ObjectId(req.gamer!.userId);

  await ensureQuestionBankSeeded();

  const recentTexts = await getRecentQuizQuestionTexts(userId);
  let pool = await QuestionBankModel.find({ type: quizType }).lean();
  if (difficulty > 0) {
    pool = pool.filter((q) => Number(q.difficulty) === difficulty);
  }
  const shuffled = [...pool]
    .filter((q) => !recentTexts.includes(String(q.questionText)))
    .sort(() => Math.random() - 0.5);

  let selected = shuffled.slice(0, limit);
  if (selected.length < limit) {
    for (const q of [...DEMO_GRAMMAR_QUESTIONS].sort(() => Math.random() - 0.5)) {
      if (selected.length >= limit) break;
      if (recentTexts.includes(q.questionText)) continue;
      if (selected.some((s) => String(s.questionText) === q.questionText)) continue;
      let exists = await QuestionBankModel.findOne({ type: quizType, questionText: q.questionText }).lean();
      if (!exists) {
        const saved = await QuestionBankModel.create({
          type: quizType,
          difficulty: q.difficulty,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          errorType: (['grammar', 'vocabulary', 'tense', 'agreement', 'other'].includes(q.category)
            ? q.category
            : 'grammar') as 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other',
        });
        exists = saved.toObject();
      }
      selected.push(exists);
    }
    selected = selected.slice(0, limit);
  }

  const difficultyLabel = (d: number) => (d <= 1 ? 'beginner' : d === 2 ? 'intermediate' : 'advanced');
  const questions = selected.map((q: any) => ({
    _id: String(q._id ?? q.id),
    type: q.type ?? quizType,
    difficulty: Number(q.difficulty ?? 2),
    difficultyLabel: difficultyLabel(Number(q.difficulty ?? 2)),
    category: String(q.errorType ?? q.category ?? 'grammar'),
    questionType: String(q.questionType ?? 'multiple_choice'),
    questionText: q.questionText ?? q.question_text,
    options: q.options,
    explanation: q.explanation,
  }));
  res.json({ questions, count: questions.length, source: shuffled.length >= limit ? 'database' : 'hybrid' });
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
          cardFront: `Quiz mistake: "${g.userAnswer}"`,
          cardBack: g.correctAnswer || '(see explanation)',
          cardExplanation: String(g.explanation ?? 'Review this grammar pattern.'),
          cardSubtype: 'grammar_correction',
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
  const validMistakes = mistakes.filter(
    (m: any) => !isLowValueCard(String(m.originalUtterance ?? m.original ?? ''), String(m.correctedForm ?? m.corrected ?? ''))
  );
  if (validMistakes.length > 0) {
    const generated = await generateFlashcardsWithLlm({
      userId: String(user._id),
      mistakesFromSession: validMistakes.map((m: any) => ({
        original: m.originalUtterance ?? m.original,
        corrected: m.correctedForm ?? m.corrected,
        type: m.errorType ?? m.type,
        explanation: m.explanation ?? m.cardExplanation,
        word: m.focusWord ?? m.word,
      })),
      limit: Math.min(6, validMistakes.length + 2),
    });
    await persistFlashcards(user._id, generated);
  }

  res.json({
    xpAwarded: { fluency: fluXp, grammar: graXp, eq: eqXp },
    newLevels: user.levels,
    levelUps: [],
    streakResult: { current: user.streak.current, longest: user.streak.longest, resilienceBonusAwarded: false, sameDaySession: false },
    achievements: [],
  });
});

router.post('/admin/demo-seed', async (req: Request, res: Response) => {
  const secret = String(process.env.DEMO_SEED_SECRET ?? 'speakwise-demo-2025').trim();
  const provided = String(req.headers['x-demo-seed-secret'] ?? req.body?.secret ?? '').trim();
  if (!provided || provided !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const result = await runFullDemoSeed();
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Demo seed failed';
    res.status(500).json({ error: message });
  }
});

export const gamificationMongoRouter = router;


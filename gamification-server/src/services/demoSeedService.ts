import mongoose from 'mongoose';
import { GamificationSessionModel } from '../models/Session';
import { MistakeModel } from '../models/Mistake';
import { QuestionBankModel } from '../models/QuestionBank';
import { UserModel } from '../models/User';
import {
  DEMO_GRAMMAR_QUESTIONS,
  ensureQuestionBankSeeded,
  isLowValueCard,
  persistFlashcards,
} from './learningContentService';
import { getStudyDeck, STUDY_DECK_SIZE } from './studyDeckService';

export function isJunkMistake(m: {
  originalUtterance?: string;
  correctedForm?: string;
  errorTag?: string;
  cardFront?: string;
}): boolean {
  const original = String(m.originalUtterance ?? '').trim();
  const corrected = String(m.correctedForm ?? '').trim();
  const tag = String(m.errorTag ?? '');
  if (['chat_memory_seed', 'chat_auto_correction'].includes(tag)) return true;
  if (isLowValueCard(original, corrected) && !String(m.cardFront ?? '').trim()) return true;
  if (/^(hi|hello|hey)\b/i.test(original) && original.length < 80) return true;
  if (/\bhow are you\b/i.test(original) && /\bemma\b/i.test(original)) return true;
  if (/^thanks?\b/i.test(original) && original.length < 40) return true;
  return false;
}

export async function cleanupJunkMistakes(): Promise<number> {
  const all = await MistakeModel.find({}).lean();
  const junkIds = all.filter(isJunkMistake).map((m) => m._id);
  if (!junkIds.length) return 0;
  const result = await MistakeModel.deleteMany({ _id: { $in: junkIds } });
  return result.deletedCount ?? 0;
}

export async function seedQuestionBankFull(): Promise<number> {
  let added = 0;
  for (const q of DEMO_GRAMMAR_QUESTIONS) {
    const exists = await QuestionBankModel.findOne({ type: 'grammar', questionText: q.questionText }).lean();
    if (exists) continue;
    await QuestionBankModel.create({
      type: 'grammar',
      difficulty: q.difficulty,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      errorType: (['grammar', 'vocabulary', 'tense', 'agreement', 'other'].includes(q.category)
        ? q.category
        : 'grammar') as 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other',
    });
    added += 1;
  }
  await ensureQuestionBankSeeded();
  return added;
}

export async function seedFlashcardsForUser(userId: mongoose.Types.ObjectId, target = STUDY_DECK_SIZE): Promise<number> {
  const studyCount = await MistakeModel.countDocuments({
    userId,
    errorTag: { $regex: /^study_/ },
  });
  if (studyCount >= target) return 0;

  await MistakeModel.deleteMany({ userId, errorTag: { $not: { $regex: /^study_/ } } });
  const ids = await persistFlashcards(userId, getStudyDeck());
  return ids.length;
}

export async function seedDemoLeaderboardUsers(): Promise<number> {
  const count = await UserModel.countDocuments();
  if (count >= 6) return 0;

  const demos = [
    { username: 'demo_alex', email: 'demo.alex@speakwise.demo', xp: { fluency: 420, grammar: 380, eq: 310 } },
    { username: 'demo_sara', email: 'demo.sara@speakwise.demo', xp: { fluency: 510, grammar: 460, eq: 390 } },
    { username: 'demo_jamal', email: 'demo.jamal@speakwise.demo', xp: { fluency: 290, grammar: 340, eq: 280 } },
    { username: 'demo_lina', email: 'demo.lina@speakwise.demo', xp: { fluency: 620, grammar: 580, eq: 500 } },
    { username: 'demo_kai', email: 'demo.kai@speakwise.demo', xp: { fluency: 180, grammar: 220, eq: 200 } },
  ];

  let created = 0;
  for (const d of demos) {
    const exists = await UserModel.findOne({ username: d.username }).lean();
    if (exists) continue;
    await UserModel.create({
      username: d.username,
      email: d.email,
      xp: d.xp,
      levels: {
        fluency: Math.min(10, Math.floor(d.xp.fluency / 100) + 1),
        grammar: Math.min(10, Math.floor(d.xp.grammar / 100) + 1),
        eq: Math.min(10, Math.floor(d.xp.eq / 100) + 1),
        composite: 5,
      },
      weeklySnapshot: {
        weekStart: new Date(),
        fluencyDelta: 12,
        grammarDelta: 8,
        eqDelta: 6,
        avgConfidence: 72,
        vocabularyDepth: 65,
        sessionsCompleted: 8,
        aiReportText: 'Strong weekly progress in grammar and fluency.',
        xpEarned: d.xp.fluency + d.xp.grammar,
      },
      streak: {
        current: 5,
        longest: 12,
        lastSessionDate: new Date(),
        streakHistory: [],
      },
    });
    created += 1;
  }
  return created;
}

export async function seedSessionsForUsers(): Promise<number> {
  const users = await UserModel.find().limit(20).lean();
  let created = 0;
  for (const user of users) {
    const existing = await GamificationSessionModel.countDocuments({ userId: user._id });
    if (existing >= 3) continue;
    for (let i = 0; i < 3; i += 1) {
      const day = new Date(Date.now() - i * 86400000);
      await GamificationSessionModel.create({
        userId: user._id,
        startedAt: day,
        endedAt: day,
        persona: user.activePersona ?? 'diplomat',
        coachMode: user.activeCoachMode ?? 'gentle',
        scores: { fluency: 72 + i * 3, grammar: 68 + i * 4, eq: 70 + i * 2 },
        xpAwarded: { fluency: 40, grammar: 35, eq: 30 },
        emotionProfile: { dominant: 'neutral', anxietyFlag: false },
        resilienceBonusAwarded: false,
        turnCount: 6 + i,
      });
      created += 1;
    }
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          'streak.current': Math.max(user.streak?.current ?? 0, 3),
          'streak.longest': Math.max(user.streak?.longest ?? 0, 7),
          'streak.lastSessionDate': new Date(),
          'weeklySnapshot.sessionsCompleted': Math.max(user.weeklySnapshot?.sessionsCompleted ?? 0, 5),
          'weeklySnapshot.xpEarned': Math.max(user.weeklySnapshot?.xpEarned ?? 0, 200),
        },
      }
    );
  }
  return created;
}

export async function runFullDemoSeed(): Promise<Record<string, number>> {
  const junkRemoved = await cleanupJunkMistakes();
  const questionsAdded = await seedQuestionBankFull();
  const leaderboardAdded = await seedDemoLeaderboardUsers();

  const users = await UserModel.find().lean();
  let flashcardsAdded = 0;
  for (const user of users) {
    flashcardsAdded += await seedFlashcardsForUser(user._id, 25);
  }

  const sessionsAdded = await seedSessionsForUsers();

  return {
    junkRemoved,
    questionsAdded,
    leaderboardAdded,
    flashcardsAdded,
    sessionsAdded,
    usersProcessed: users.length,
  };
}

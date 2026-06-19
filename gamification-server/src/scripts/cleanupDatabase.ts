/**
 * Removes junk data and re-seeds the curated study deck for demo users.
 * Usage: npm run cleanup:db
 */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { MistakeModel } from '../models/Mistake';
import { UserModel } from '../models/User';
import { QuestionBankModel } from '../models/QuestionBank';
import { getStudyDeck } from '../services/studyDeckService';
import { persistFlashcards } from '../services/learningContentService';
import { isJunkMistake } from '../services/demoSeedService';

async function main(): Promise<void> {
  const uri = String(process.env.MONGO_URI ?? '').trim();
  const dbName = String(process.env.MONGO_DB_NAME ?? 'english_tutor').trim();
  if (!uri) throw new Error('MONGO_URI is required');
  await connectDatabase(uri, dbName);
  console.log('[cleanup] Connected to MongoDB');

  const junkResult = await MistakeModel.deleteMany({
    $or: [
      { cardFront: { $in: ['', null] } },
      { cardBack: { $in: ['', null] } },
    ],
  });
  console.log(`[cleanup] Removed ${junkResult.deletedCount} empty flashcards`);

  const allMistakes = await MistakeModel.find({}).lean();
  const junkIds = allMistakes.filter(isJunkMistake).map((m) => m._id);
  if (junkIds.length) {
    const r = await MistakeModel.deleteMany({ _id: { $in: junkIds } });
    console.log(`[cleanup] Removed ${r.deletedCount} junk mistake cards`);
  }

  const nonStudy = await MistakeModel.deleteMany({
    errorTag: { $not: { $regex: /^study_/ } },
  });
  console.log(`[cleanup] Removed ${nonStudy.deletedCount} non-study flashcards`);

  const dupGroups = await MistakeModel.aggregate([
    { $group: { _id: { userId: '$userId', cardFront: '$cardFront' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  let dupRemoved = 0;
  for (const g of dupGroups) {
    const [, ...rest] = g.ids;
    if (rest.length) {
      const r = await MistakeModel.deleteMany({ _id: { $in: rest } });
      dupRemoved += r.deletedCount ?? 0;
    }
  }
  console.log(`[cleanup] Removed ${dupRemoved} duplicate flashcards`);

  const testUsers = await UserModel.deleteMany({
    username: { $regex: /^test_|^demo_test_/i },
  });
  console.log(`[cleanup] Removed ${testUsers.deletedCount} test users`);

  const users = await UserModel.find({}).select('_id username').lean();
  let reseeded = 0;
  for (const user of users) {
    const studyCount = await MistakeModel.countDocuments({
      userId: user._id,
      errorTag: { $regex: /^study_/ },
    });
    if (studyCount < 30) {
      await MistakeModel.deleteMany({ userId: user._id });
      await persistFlashcards(user._id, getStudyDeck());
      reseeded += 1;
    }
  }
  console.log(`[cleanup] Reseeded study deck for ${reseeded} users`);

  const questionCount = await QuestionBankModel.countDocuments({ type: 'grammar' });
  console.log(`[cleanup] Question bank: ${questionCount} grammar questions`);

  const studyCards = await MistakeModel.countDocuments({ errorTag: { $regex: /^study_/ } });
  console.log(`[cleanup] Study flashcards remaining: ${studyCards}`);
  console.log('[cleanup] Done');
  await disconnectDatabase();
}

main().catch((err) => {
  console.error('[cleanup] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

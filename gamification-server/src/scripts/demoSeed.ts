import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { runFullDemoSeed } from '../services/demoSeedService';

async function main(): Promise<void> {
  const uri = String(process.env.MONGO_URI ?? '').trim();
  const dbName = String(process.env.MONGO_DB_NAME ?? 'english_tutor').trim();
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }
  await connectDatabase(uri, dbName);
  const result = await runFullDemoSeed();
  console.log('Demo seed complete:', JSON.stringify(result, null, 2));
  await disconnectDatabase();
}

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});

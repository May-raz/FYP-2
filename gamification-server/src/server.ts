import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './config/db';

const port = parseInt(process.env.PORT ?? '5000', 10);

async function main(): Promise<void> {
  console.log('Mongo-only backend configured');
  const mongoUri = (process.env.MONGO_URI ?? '').trim();
  const mongoDbName = (process.env.MONGO_DB_NAME ?? 'english_tutor').trim();
  if (mongoUri) {
    await connectDatabase(mongoUri, mongoDbName);
    console.log(`MongoDB connected (db=${mongoDbName})`);
  } else {
    console.warn('MONGO_URI not set; /api tutor routes will not persist users');
  }
  const app = createApp();
  app.listen(port, () => {
    console.log(`Fluency Engine gamification API http://127.0.0.1:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

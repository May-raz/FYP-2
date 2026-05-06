import 'dotenv/config';
import { connectDatabase } from './config/db';
import { createApp } from './app';

const port = parseInt(process.env.PORT ?? '5000', 10);
const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/fluency_engine';

async function main(): Promise<void> {
  try {
    await connectDatabase(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed, starting API without DB:', err);
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

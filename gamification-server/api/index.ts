import 'dotenv/config';
import type { Request, Response } from 'express';
import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';

const app = createApp();
let initPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const mongoUri = (process.env.MONGO_URI ?? '').trim();
      const mongoDbName = (process.env.MONGO_DB_NAME ?? 'english_tutor').trim();
      if (mongoUri) {
        await connectDatabase(mongoUri, mongoDbName);
      }
    })();
  }
  await initPromise;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  await ensureReady();
  app(req, res);
}

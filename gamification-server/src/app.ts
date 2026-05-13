import cors from 'cors';
import express from 'express';
import { gamificationMongoRouter } from './routes/gamificationMongoRouter';
import { tutorRouter } from './routes/tutorRouter';

export function createApp(): express.Express {
  const app = express();
  const corsOrigins = (
    process.env.FRONTEND_ORIGIN
      ? process.env.FRONTEND_ORIGIN.split(',').map((v) => v.trim()).filter(Boolean)
      : ['http://localhost:3000', 'http://127.0.0.1:3000']
  );
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'fluency-engine-gamification' });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'healthy', service: 'fluency-engine-gamification' });
  });
  app.get('/', (_req, res) => {
    res.send('Gamification server running');
  });

  app.use('/api', tutorRouter);
  app.use('/api/v1/gamification', gamificationMongoRouter);

  return app;
}

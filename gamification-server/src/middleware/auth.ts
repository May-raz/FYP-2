import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ensureGamificationUser } from '../services/userProvisioning';

function getJwtSecret(): string {
  return process.env.JWT_SECRET_KEY ?? process.env.JWT_SECRET ?? 'english-tutor-secret-key-2025';
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const username = typeof payload.sub === 'string' ? payload.sub : null;
    if (!username) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const user = await ensureGamificationUser(username);
    req.gamer = { userId: user._id.toString(), username };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

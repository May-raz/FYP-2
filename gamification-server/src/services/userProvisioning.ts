import { UserModel } from '../models/User';
import type { GamerUserApi } from '../types/gamer';

function toGamerUserApiFromMongo(row: any): GamerUserApi {
  return {
    _id: String(row._id),
    username: String(row.username),
    email: String(row.email),
    xp: {
      fluency: Number(row.xp?.fluency ?? 0),
      grammar: Number(row.xp?.grammar ?? 0),
      eq: Number(row.xp?.eq ?? 0),
    },
    levels: {
      fluency: Number(row.levels?.fluency ?? 1),
      grammar: Number(row.levels?.grammar ?? 1),
      eq: Number(row.levels?.eq ?? 1),
      composite: Number(row.levels?.composite ?? 1),
    },
    activePersona: String(row.activePersona ?? 'diplomat'),
    unlockedPersonas: Array.isArray(row.unlockedPersonas) ? row.unlockedPersonas : ['diplomat'],
    activeCoachMode: String(row.activeCoachMode ?? 'gentle'),
    unlockedCoachModes: Array.isArray(row.unlockedCoachModes) ? row.unlockedCoachModes : ['gentle'],
    streak: {
      current: Number(row.streak?.current ?? 0),
      longest: Number(row.streak?.longest ?? 0),
      lastSessionDate: row.streak?.lastSessionDate ? new Date(row.streak.lastSessionDate).toISOString() : null,
      streakHistory: Array.isArray(row.streak?.streakHistory)
        ? row.streak.streakHistory.map((h: any) => ({
            date: new Date(h.date).toISOString(),
            score: Number(h.score ?? 0),
            emotionFlag: Boolean(h.emotionFlag),
          }))
        : [],
    },
    emotionPassport: {
      completedScenarios: Array.isArray(row.emotionPassport?.completedScenarios)
        ? row.emotionPassport.completedScenarios.map((c: any) => ({
            scenarioId: String(c.scenarioId),
            completedAt: new Date(c.completedAt).toISOString(),
            scoreAchieved: Number(c.scoreAchieved ?? 0),
          }))
        : [],
      stampCount: Number(row.emotionPassport?.stampCount ?? 0),
    },
    weeklySnapshot: {
      weekStart: row.weeklySnapshot?.weekStart ? new Date(row.weeklySnapshot.weekStart).toISOString() : new Date(0).toISOString(),
      fluencyDelta: Number(row.weeklySnapshot?.fluencyDelta ?? 0),
      grammarDelta: Number(row.weeklySnapshot?.grammarDelta ?? 0),
      eqDelta: Number(row.weeklySnapshot?.eqDelta ?? 0),
      avgConfidence: Number(row.weeklySnapshot?.avgConfidence ?? 0),
      vocabularyDepth: Number(row.weeklySnapshot?.vocabularyDepth ?? 0),
      sessionsCompleted: Number(row.weeklySnapshot?.sessionsCompleted ?? 0),
      aiReportText: String(row.weeklySnapshot?.aiReportText ?? ''),
      xpEarned: Number(row.weeklySnapshot?.xpEarned ?? 0),
    },
  };
}

/**
 * Ensures a Mongo gamification user exists for this Flask JWT identity (`username`).
 */
export async function ensureGamificationUser(
  username: string,
  emailHint?: string
): Promise<GamerUserApi> {
  const uname = username.trim();
  if (!uname) {
    throw new Error('Empty username');
  }

  let existing = await UserModel.findOne({ username: uname }).lean();
  if (!existing) {
    const email = (emailHint ?? `${uname}+gamification@local`).toLowerCase();
    existing = await UserModel.create({ username: uname, email });
  }
  return toGamerUserApiFromMongo(existing);
}

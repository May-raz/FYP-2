export interface GamerUserRow {
  id: string;
  username: string;
  email: string;
  xp_fluency: number;
  xp_grammar: number;
  xp_eq: number;
  level_fluency: number;
  level_grammar: number;
  level_eq: number;
  level_composite: number;
  active_persona: string;
  unlocked_personas: string[] | null;
  active_coach_mode: string;
  unlocked_coach_modes: string[] | null;
  streak_current: number;
  streak_longest: number;
  streak_last_session: string | null;
  streak_history: unknown[] | null;
  passport_completed: unknown[] | null;
  passport_stamp_count: number;
  weekly_week_start: string;
  weekly_fluency_delta: number;
  weekly_grammar_delta: number;
  weekly_eq_delta: number;
  weekly_avg_confidence: number;
  weekly_vocab_depth: number;
  weekly_sessions_completed: number;
  weekly_ai_report: string;
  weekly_xp_earned: number;
}

export interface GamerUserApi {
  _id: string;
  username: string;
  email: string;
  xp: { fluency: number; grammar: number; eq: number };
  levels: { fluency: number; grammar: number; eq: number; composite: number };
  activePersona: string;
  unlockedPersonas: string[];
  activeCoachMode: string;
  unlockedCoachModes: string[];
  streak: {
    current: number;
    longest: number;
    lastSessionDate: string | null;
    streakHistory: Array<{ date: string; score: number; emotionFlag: boolean }>;
  };
  emotionPassport: {
    completedScenarios: Array<{ scenarioId: string; completedAt: string; scoreAchieved: number }>;
    stampCount: number;
  };
  weeklySnapshot: {
    weekStart: string;
    fluencyDelta: number;
    grammarDelta: number;
    eqDelta: number;
    avgConfidence: number;
    vocabularyDepth: number;
    sessionsCompleted: number;
    aiReportText: string;
    xpEarned: number;
  };
}

export function toGamerUserApi(row: GamerUserRow): GamerUserApi {
  return {
    _id: row.id,
    username: row.username,
    email: row.email,
    xp: {
      fluency: row.xp_fluency ?? 0,
      grammar: row.xp_grammar ?? 0,
      eq: row.xp_eq ?? 0,
    },
    levels: {
      fluency: row.level_fluency ?? 1,
      grammar: row.level_grammar ?? 1,
      eq: row.level_eq ?? 1,
      composite: row.level_composite ?? 1,
    },
    activePersona: row.active_persona ?? 'diplomat',
    unlockedPersonas: row.unlocked_personas ?? ['diplomat'],
    activeCoachMode: row.active_coach_mode ?? 'gentle',
    unlockedCoachModes: row.unlocked_coach_modes ?? ['gentle'],
    streak: {
      current: row.streak_current ?? 0,
      longest: row.streak_longest ?? 0,
      lastSessionDate: row.streak_last_session ?? null,
      streakHistory: Array.isArray(row.streak_history)
        ? (row.streak_history as Array<{ date: string; score: number; emotionFlag: boolean }>)
        : [],
    },
    emotionPassport: {
      completedScenarios: Array.isArray(row.passport_completed)
        ? (row.passport_completed as Array<{ scenarioId: string; completedAt: string; scoreAchieved: number }>)
        : [],
      stampCount: row.passport_stamp_count ?? 0,
    },
    weeklySnapshot: {
      weekStart: row.weekly_week_start,
      fluencyDelta: row.weekly_fluency_delta ?? 0,
      grammarDelta: row.weekly_grammar_delta ?? 0,
      eqDelta: row.weekly_eq_delta ?? 0,
      avgConfidence: row.weekly_avg_confidence ?? 0,
      vocabularyDepth: row.weekly_vocab_depth ?? 0,
      sessionsCompleted: row.weekly_sessions_completed ?? 0,
      aiReportText: row.weekly_ai_report ?? '',
      xpEarned: row.weekly_xp_earned ?? 0,
    },
  };
}


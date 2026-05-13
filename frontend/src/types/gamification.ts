/**
 * Fluency Engine — shared gamification types (frontend + API contracts).
 * IDs are stringified ObjectIds in JSON over the wire.
 */

export type PersonaType = 'diplomat' | 'storyteller' | 'debater' | 'empath';

export type CoachModeType = 'gentle' | 'strict' | 'debate';

export type XpTrack = 'fluency' | 'grammar' | 'eq';

export interface UserXpPools {
  fluency: number;
  grammar: number;
  eq: number;
}

export interface UserLevels {
  fluency: number;
  grammar: number;
  eq: number;
  composite: number;
}

export interface StreakHistoryEntry {
  date: string;
  score: number;
  emotionFlag: boolean;
}

export interface UserStreak {
  current: number;
  longest: number;
  lastSessionDate: string | null;
  streakHistory: StreakHistoryEntry[];
}

export interface EmotionPassportScenarioCompletion {
  scenarioId: string;
  completedAt: string;
  scoreAchieved: number;
}

export interface UserEmotionPassport {
  completedScenarios: EmotionPassportScenarioCompletion[];
  stampCount: number;
}

/** Snapshot refreshed weekly (Sunday midnight). */
export interface WeeklySnapshot {
  weekStart: string;
  fluencyDelta: number;
  grammarDelta: number;
  eqDelta: number;
  avgConfidence: number;
  vocabularyDepth: number;
  sessionsCompleted: number;
  aiReportText: string;
  /** Optional aggregate for weekly leaderboard sorting (spec Part 3). */
  xpEarned?: number;
}

export interface UserGamificationDocument {
  _id: string;
  username: string;
  email: string;
  createdAt: string;
  xp: UserXpPools;
  levels: UserLevels;
  activePersona: PersonaType;
  unlockedPersonas: PersonaType[];
  activeCoachMode: CoachModeType;
  unlockedCoachModes: CoachModeType[];
  streak: UserStreak;
  emotionPassport: UserEmotionPassport;
  weeklySnapshot: WeeklySnapshot;
}

export interface SessionScores {
  fluency: number;
  grammar: number;
  eq: number;
}

export interface SessionXpAwarded {
  fluency: number;
  grammar: number;
  eq: number;
}

export interface SessionEmotionProfile {
  dominant: string;
  anxietyFlag: boolean;
}

export interface GamificationSessionDocument {
  _id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  persona: string;
  coachMode: string;
  scores: SessionScores;
  xpAwarded: SessionXpAwarded;
  emotionProfile: SessionEmotionProfile;
  resilienceBonusAwarded: boolean;
  turnCount: number;
}

export type MistakeErrorType = 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other';

export type FlashcardReviewResult = 'correct' | 'incorrect' | 'skipped' | null;

export interface MistakeDocument {
  _id: string;
  userId: string;
  sessionId: string;
  createdAt: string;
  originalUtterance: string;
  correctedForm: string;
  errorType: MistakeErrorType;
  errorTag: string;
  nextReviewDate: string;
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  lastReviewResult: FlashcardReviewResult;
}

export type EmotionScenarioDifficulty = 1 | 2 | 3;

export interface EmotionScenarioXpReward {
  fluency: number;
  grammar: number;
  eq: number;
}

export interface EmotionScenarioDocument {
  _id: string;
  scenarioId: string;
  title: string;
  description: string;
  emotionContext: string;
  difficulty: EmotionScenarioDifficulty;
  persona: string[];
  xpReward: EmotionScenarioXpReward;
  passportStampId: string;
}

export type QuizType = 'grammar' | 'emotion-recognition';

export interface QuizQuestionResult {
  questionId: string;
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
}

export interface QuizResultDocument {
  _id: string;
  userId: string;
  sessionId: string;
  quizType: QuizType;
  questions: QuizQuestionResult[];
  score: number;
  xpAwarded: number;
  completedAt: string;
}

export type AchievementCategory =
  | 'level'
  | 'streak'
  | 'passport'
  | 'persona'
  | 'coach'
  | 'quiz';

export interface AchievementDocument {
  _id: string;
  userId: string;
  achievementId: string;
  title: string;
  description: string;
  awardedAt: string;
  category: AchievementCategory;
}

export type QuestionBankType = 'grammar' | 'emotion-recognition';

export type QuestionBankDifficulty = 1 | 2 | 3;

export interface QuestionBankDocument {
  _id: string;
  type: QuestionBankType;
  difficulty: QuestionBankDifficulty;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  errorType?: MistakeErrorType;
  persona?: string[];
}

/** API: POST /api/v1/gamification/session/complete */
export interface SessionCompleteBody {
  sessionId: string;
  scores: SessionScores;
  turnCount: number;
  emotionProfile: SessionEmotionProfile;
}

export interface LevelUpEvent {
  track: XpTrack;
  fromLevel: number;
  toLevel: number;
}

export interface SessionCompleteResponse {
  xpAwarded: SessionXpAwarded;
  newLevels: UserLevels;
  levelUps: LevelUpEvent[];
  streakResult: {
    current: number;
    longest: number;
    resilienceBonusAwarded: boolean;
  };
  achievements: AchievementDocument[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  compositeLevel: number;
  persona: PersonaType;
  avatarInitial: string;
}

export interface UserGamificationProfile extends UserGamificationDocument {
  recentAchievements?: AchievementDocument[];
}

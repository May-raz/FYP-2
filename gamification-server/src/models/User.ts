import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const PERSONAS = ['diplomat', 'storyteller', 'debater', 'empath'] as const;
const COACH_MODES = ['gentle', 'strict', 'debate'] as const;

const streakHistoryEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    score: { type: Number, required: true },
    emotionFlag: { type: Boolean, required: true },
  },
  { _id: false }
);

const passportCompletionSchema = new Schema(
  {
    scenarioId: { type: String, required: true },
    completedAt: { type: Date, required: true },
    scoreAchieved: { type: Number, required: true },
  },
  { _id: false }
);

const weeklySnapshotSchema = new Schema(
  {
    weekStart: { type: Date, required: true },
    fluencyDelta: { type: Number, default: 0 },
    grammarDelta: { type: Number, default: 0 },
    eqDelta: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0 },
    vocabularyDepth: { type: Number, default: 0 },
    sessionsCompleted: { type: Number, default: 0 },
    aiReportText: { type: String, default: '' },
    /** Weekly leaderboard tie-break / sort key (Part 3). */
    xpEarned: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    xp: {
      type: {
        fluency: { type: Number, default: 0, min: 0 },
        grammar: { type: Number, default: 0, min: 0 },
        eq: { type: Number, default: 0, min: 0 },
      },
      required: true,
      _id: false,
      default: () => ({ fluency: 0, grammar: 0, eq: 0 }),
    },
    levels: {
      type: {
        fluency: { type: Number, default: 1, min: 1, max: 10 },
        grammar: { type: Number, default: 1, min: 1, max: 10 },
        eq: { type: Number, default: 1, min: 1, max: 10 },
        composite: { type: Number, default: 1, min: 1, max: 10 },
      },
      required: true,
      _id: false,
      default: () => ({
        fluency: 1,
        grammar: 1,
        eq: 1,
        composite: 1,
      }),
    },
    activePersona: {
      type: String,
      enum: PERSONAS,
      default: 'diplomat',
    },
    unlockedPersonas: {
      type: [{ type: String, enum: PERSONAS }],
      default: () => ['diplomat'],
    },
    activeCoachMode: {
      type: String,
      enum: COACH_MODES,
      default: 'gentle',
    },
    unlockedCoachModes: {
      type: [{ type: String, enum: COACH_MODES }],
      default: () => ['gentle'],
    },
    streak: {
      type: {
        current: { type: Number, default: 0, min: 0 },
        longest: { type: Number, default: 0, min: 0 },
        lastSessionDate: { type: Date, default: null },
        streakHistory: { type: [streakHistoryEntrySchema], default: [] },
      },
      required: true,
      _id: false,
      default: () => ({
        current: 0,
        longest: 0,
        lastSessionDate: null,
        streakHistory: [],
      }),
    },
    emotionPassport: {
      type: {
        completedScenarios: { type: [passportCompletionSchema], default: [] },
        stampCount: { type: Number, default: 0, min: 0, max: 12 },
      },
      required: true,
      _id: false,
      default: () => ({
        completedScenarios: [],
        stampCount: 0,
      }),
    },
    weeklySnapshot: {
      type: weeklySnapshotSchema,
      required: true,
      default: () => ({
        weekStart: new Date(0),
        fluencyDelta: 0,
        grammarDelta: 0,
        eqDelta: 0,
        avgConfidence: 0,
        vocabularyDepth: 0,
        sessionsCompleted: 0,
        aiReportText: '',
        xpEarned: 0,
      }),
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'users',
  }
);

userSchema.index({ 'levels.composite': -1 });
userSchema.index({ activePersona: 1, 'levels.composite': -1 });
userSchema.index({ 'weeklySnapshot.xpEarned': -1 });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = mongoose.HydratedDocument<User>;

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ??
  mongoose.model<User>('User', userSchema);

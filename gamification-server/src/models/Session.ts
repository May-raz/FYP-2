import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const scoresSchema = new Schema(
  {
    fluency: { type: Number, required: true, min: 0, max: 100 },
    grammar: { type: Number, required: true, min: 0, max: 100 },
    eq: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const xpAwardedSchema = new Schema(
  {
    fluency: { type: Number, required: true, min: 0 },
    grammar: { type: Number, required: true, min: 0 },
    eq: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const emotionProfileSchema = new Schema(
  {
    dominant: { type: String, required: true },
    anxietyFlag: { type: Boolean, required: true },
  },
  { _id: false }
);

const gamificationSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date, default: null },
    persona: { type: String, required: true },
    coachMode: { type: String, required: true },
    scores: { type: scoresSchema, required: true },
    xpAwarded: { type: xpAwardedSchema, required: true },
    emotionProfile: { type: emotionProfileSchema, required: true },
    resilienceBonusAwarded: { type: Boolean, default: false },
    turnCount: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: false,
    collection: 'sessions',
  }
);

gamificationSessionSchema.index({ userId: 1, startedAt: -1 });

export type GamificationSession = InferSchemaType<typeof gamificationSessionSchema>;
export type GamificationSessionDocument = mongoose.HydratedDocument<GamificationSession>;

export const GamificationSessionModel: Model<GamificationSession> =
  (mongoose.models.GamificationSession as Model<GamificationSession> | undefined) ??
  mongoose.model<GamificationSession>('GamificationSession', gamificationSessionSchema);

import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const xpRewardSchema = new Schema(
  {
    fluency: { type: Number, required: true, min: 0 },
    grammar: { type: Number, required: true, min: 0 },
    eq: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const emotionScenarioSchema = new Schema(
  {
    scenarioId: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    emotionContext: { type: String, required: true },
    difficulty: { type: Number, required: true, enum: [1, 2, 3] },
    persona: { type: [String], required: true, default: [] },
    xpReward: { type: xpRewardSchema, required: true },
    passportStampId: { type: String, required: true, trim: true },
  },
  {
    timestamps: false,
    collection: 'emotionScenarios',
  }
);

emotionScenarioSchema.index({ persona: 1, difficulty: 1 });

export type EmotionScenario = InferSchemaType<typeof emotionScenarioSchema>;
export type EmotionScenarioDocument = mongoose.HydratedDocument<EmotionScenario>;

export const EmotionScenarioModel: Model<EmotionScenario> =
  (mongoose.models.EmotionScenario as Model<EmotionScenario> | undefined) ??
  mongoose.model<EmotionScenario>('EmotionScenario', emotionScenarioSchema);

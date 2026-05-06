import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const CATEGORIES = ['level', 'streak', 'passport', 'persona', 'coach', 'quiz'] as const;

const achievementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    achievementId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    awardedAt: { type: Date, required: true, default: () => new Date() },
    category: { type: String, enum: CATEGORIES, required: true },
  },
  {
    timestamps: false,
    collection: 'achievements',
  }
);

achievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
achievementSchema.index({ userId: 1, awardedAt: -1 });

export type Achievement = InferSchemaType<typeof achievementSchema>;
export type AchievementDocument = mongoose.HydratedDocument<Achievement>;

export const AchievementModel: Model<Achievement> =
  (mongoose.models.Achievement as Model<Achievement> | undefined) ??
  mongoose.model<Achievement>('Achievement', achievementSchema);

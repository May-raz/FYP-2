import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const tutorProfileSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  {
    collection: 'tutor_profiles',
    timestamps: false,
  }
);

export type TutorProfile = InferSchemaType<typeof tutorProfileSchema>;

export const TutorProfileModel: Model<TutorProfile> =
  (mongoose.models.TutorProfile as Model<TutorProfile> | undefined) ??
  mongoose.model<TutorProfile>('TutorProfile', tutorProfileSchema);


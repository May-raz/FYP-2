import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const tutorAuthUserSchema = new Schema(
  {
    id: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true, trim: true },
    email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: false },
  },
  {
    collection: 'tutor_auth_users',
    timestamps: false,
  }
);

export type TutorAuthUser = InferSchemaType<typeof tutorAuthUserSchema>;

export const TutorAuthUserModel: Model<TutorAuthUser> =
  (mongoose.models.TutorAuthUser as Model<TutorAuthUser> | undefined) ??
  mongoose.model<TutorAuthUser>('TutorAuthUser', tutorAuthUserSchema);


import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const QUIZ_TYPES = ['grammar', 'emotion-recognition'] as const;

const questionResultSchema = new Schema(
  {
    questionId: { type: String, required: true },
    correct: { type: Boolean, required: true },
    userAnswer: { type: String, required: true },
    correctAnswer: { type: String, required: true },
  },
  { _id: false }
);

const quizResultSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'GamificationSession', required: true, index: true },
    quizType: { type: String, enum: QUIZ_TYPES, required: true },
    questions: { type: [questionResultSchema], required: true, default: [] },
    score: { type: Number, required: true, min: 0, max: 100 },
    xpAwarded: { type: Number, required: true, min: 0 },
    completedAt: { type: Date, required: true, default: () => new Date() },
  },
  {
    timestamps: false,
    collection: 'quizResults',
  }
);

quizResultSchema.index({ userId: 1, completedAt: -1 });

export type QuizResult = InferSchemaType<typeof quizResultSchema>;
export type QuizResultDocument = mongoose.HydratedDocument<QuizResult>;

export const QuizResultModel: Model<QuizResult> =
  (mongoose.models.QuizResult as Model<QuizResult> | undefined) ??
  mongoose.model<QuizResult>('QuizResult', quizResultSchema);

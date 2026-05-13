import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const QUESTION_TYPES = ['grammar', 'emotion-recognition'] as const;
const ERROR_TYPES = ['grammar', 'vocabulary', 'tense', 'agreement', 'other'] as const;

const questionBankSchema = new Schema(
  {
    type: { type: String, enum: QUESTION_TYPES, required: true, index: true },
    difficulty: { type: Number, required: true, enum: [1, 2, 3], index: true },
    questionText: { type: String, required: true },
    options: { type: [String], required: true, default: [] },
    correctAnswer: { type: String, required: true },
    explanation: { type: String, required: true },
    errorType: { type: String, enum: ERROR_TYPES, required: false },
    persona: { type: [String], required: false, default: undefined },
  },
  {
    timestamps: false,
    collection: 'questionBank',
  }
);

questionBankSchema.index({ type: 1, difficulty: 1 });

export type QuestionBank = InferSchemaType<typeof questionBankSchema>;
export type QuestionBankDocument = mongoose.HydratedDocument<QuestionBank>;

export const QuestionBankModel: Model<QuestionBank> =
  (mongoose.models.QuestionBank as Model<QuestionBank> | undefined) ??
  mongoose.model<QuestionBank>('QuestionBank', questionBankSchema);

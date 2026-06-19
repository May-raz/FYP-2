import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const ERROR_TYPES = ['grammar', 'vocabulary', 'tense', 'agreement', 'other'] as const;
const REVIEW_RESULTS = ['easy', 'medium', 'hard', 'correct', 'incorrect', 'skipped'] as const;

const mistakeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Optional when created outside a tracked session (e.g. quiz-only). */
    sessionId: { type: Schema.Types.ObjectId, ref: 'GamificationSession', default: null, index: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    originalUtterance: { type: String, required: true },
    correctedForm: { type: String, required: true },
    errorType: { type: String, enum: ERROR_TYPES, required: true },
    errorTag: { type: String, required: true },
    cardFront: { type: String, default: '' },
    cardBack: { type: String, default: '' },
    cardExplanation: { type: String, default: '' },
    cardSubtype: {
      type: String,
      enum: [
        'vocabulary',
        'grammar_correction',
        'pronunciation',
        'sentence_improvement',
        'fill_blank',
        'choose_sentence',
        'contextual',
      ],
      default: 'grammar_correction',
    },
    focusWord: { type: String, default: '' },
    cardOptions: { type: [String], default: [] },
    nextReviewDate: { type: Date, required: true, index: true },
    intervalDays: { type: Number, required: true, min: 1, default: 1 },
    easeFactor: { type: Number, required: true, min: 1.3, default: 2.5 },
    reviewCount: { type: Number, required: true, min: 0, default: 0 },
    lastReviewResult: {
      type: String,
      default: null,
      validate: {
        validator(v: unknown): boolean {
          if (v === null || v === undefined) return true;
          return typeof v === 'string' && REVIEW_RESULTS.includes(v as (typeof REVIEW_RESULTS)[number]);
        },
      },
    },
  },
  {
    timestamps: false,
    collection: 'mistakes',
  }
);

mistakeSchema.index({ userId: 1, nextReviewDate: 1 });

export type Mistake = InferSchemaType<typeof mistakeSchema>;
export type MistakeDocument = mongoose.HydratedDocument<Mistake>;

export const MistakeModel: Model<Mistake> =
  (mongoose.models.Mistake as Model<Mistake> | undefined) ??
  mongoose.model<Mistake>('Mistake', mistakeSchema);

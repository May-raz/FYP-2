import { z } from 'zod';

const idString = z.string().min(1, 'Invalid id');

export const sessionCompleteSchema = z.object({
  sessionId: idString,
  scores: z.object({
    fluency: z.number().min(0).max(100),
    grammar: z.number().min(0).max(100),
    eq: z.number().min(0).max(100),
  }),
  turnCount: z.number().int().min(0),
  emotionProfile: z.object({
    dominant: z.string().min(1),
    anxietyFlag: z.boolean(),
  }),
  sessionCompleted: z.boolean().optional(),
  metrics: z
    .object({
      wordsPerMinuteScore: z.number().optional(),
      pauseFrequencyScore: z.number().optional(),
      vocabularyDiversityRatio: z.number().optional(),
      grammarErrorFreeTurnRatio: z.number().optional(),
      grammarErrorReductionVsPrev: z.number().optional(),
      eqToneScore: z.number().optional(),
    })
    .optional(),
  mistakes: z
    .array(
      z.object({
        originalUtterance: z.string().min(1),
        correctedForm: z.string().min(1),
        errorType: z.enum(['grammar', 'vocabulary', 'tense', 'agreement', 'other']),
        errorTag: z.string().min(1),
      })
    )
    .optional(),
});

export const flashcardReviewSchema = z.object({
  mistakeId: idString,
  result: z.enum(['correct', 'incorrect', 'skipped']),
});

export const scenarioCompleteSchema = z.object({
  scenarioId: z.string().min(1),
  conversationTranscript: z.string().min(1),
  aiEqScore: z.number().min(0).max(100),
});

export const quizSubmitSchema = z.object({
  quizType: z.enum(['grammar', 'emotion-recognition']),
  sessionId: idString.optional(),
  answers: z.array(
    z.object({
      questionId: idString,
      userAnswer: z.string(),
    })
  ),
});

export const personaPutSchema = z.object({
  persona: z.enum(['diplomat', 'storyteller', 'debater', 'empath']),
});

export const coachModePutSchema = z.object({
  mode: z.enum(['gentle', 'strict', 'debate']),
});

export const microSessionSchema = z.object({
  emotionProfile: z.object({
    dominant: z.string().min(1),
    anxietyFlag: z.boolean(),
  }),
});

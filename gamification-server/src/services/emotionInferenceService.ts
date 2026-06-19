import type { TypingMetrics, VoiceMetrics } from './emotionEngine';
import { estimateSentiment } from './emotionEngine';

export interface EmotionInference {
  emotion: string;
  intent: string;
  confidence: number;
  reason: string;
  responseStyle: string;
}

const EMOTIONS = new Set([
  'nervous', 'confused', 'confident', 'frustrated', 'excited', 'happy', 'sad', 'neutral',
]);
const INTENTS = new Set([
  'question', 'answer', 'opinion', 'story', 'help_request', 'pronunciation_practice', 'small_talk',
]);
const STYLES = new Set(['supportive', 'challenging', 'gentle', 'curious', 'encouraging']);

function clamp01(n: unknown, fallback = 0.5): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function heuristicInference(message: string, metrics?: {
  typingMetrics?: TypingMetrics;
  voiceMetrics?: VoiceMetrics;
}): EmotionInference {
  const lower = String(message || '').toLowerCase();
  const sentiment = estimateSentiment(message);
  const wpm = Number(metrics?.voiceMetrics?.wordsPerMinute ?? 0);
  const fillers = Number(metrics?.voiceMetrics?.fillerCount ?? 0);
  const avgPause = Number(metrics?.typingMetrics?.avgPauseMs ?? 0);

  let emotion = 'neutral';
  if (/\b(nervous|worried|scared|anxious)\b/.test(lower)) emotion = 'nervous';
  else if (/\b(confused|don't understand|unclear)\b/.test(lower)) emotion = 'confused';
  else if (/\b(frustrated|annoyed|stuck)\b/.test(lower)) emotion = 'frustrated';
  else if (/\b(excited|amazing|awesome|great)\b/.test(lower)) emotion = 'excited';
  else if (/\b(happy|glad|good)\b/.test(lower)) emotion = 'happy';
  else if (/\b(sad|upset|down)\b/.test(lower)) emotion = 'sad';
  else if (sentiment > 0.2 || wpm > 100) emotion = 'confident';
  else if (fillers >= 3 || avgPause > 900) emotion = 'nervous';

  let intent = 'small_talk';
  if (/\b(pronounc|accent|how (do|to) say)\b/.test(lower)) intent = 'pronunciation_practice';
  else if (/\b(help|don't know|explain)\b/.test(lower)) intent = 'help_request';
  else if (message.endsWith('?') || /^(what|why|how|can you|could you)\b/.test(lower)) intent = 'question';
  else if (/\b(i think|in my opinion|i believe)\b/.test(lower)) intent = 'opinion';
  else if (/\b(yesterday|when i|one time|story)\b/.test(lower)) intent = 'story';
  else if (lower.length > 20) intent = 'answer';

  let responseStyle = 'encouraging';
  if (emotion === 'nervous' || emotion === 'sad' || emotion === 'confused') responseStyle = 'supportive';
  else if (emotion === 'frustrated') responseStyle = 'gentle';
  else if (intent === 'question') responseStyle = 'curious';
  else if (emotion === 'confident' || emotion === 'excited') responseStyle = 'challenging';

  return {
    emotion,
    intent,
    confidence: 0.55,
    reason: 'Inferred from message wording and speaking behavior signals.',
    responseStyle,
  };
}

export async function inferEmotionWithLlm(args: {
  message: string;
  typingMetrics?: TypingMetrics;
  voiceMetrics?: VoiceMetrics;
}): Promise<EmotionInference> {
  const fallback = heuristicInference(args.message, args);
  const apiKey = String(process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? '').trim();
  if (!apiKey || !String(args.message || '').trim()) return fallback;

  const model = String(process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You infer a learner's emotional state from English practice messages. Return JSON only:
{ "emotion": "nervous|confused|confident|frustrated|excited|happy|sad|neutral",
  "intent": "question|answer|opinion|story|help_request|pronunciation_practice|small_talk",
  "confidence": 0.0-1.0,
  "reason": "short reason",
  "responseStyle": "supportive|challenging|gentle|curious|encouraging" }
Be honest — this is AI-inferred, not clinical diagnosis.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              message: args.message,
              typingMetrics: args.typingMetrics ?? {},
              voiceMetrics: args.voiceMetrics ?? {},
            }),
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = String(json?.choices?.[0]?.message?.content ?? '').trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EmotionInference>;
    const emotion = EMOTIONS.has(String(parsed.emotion)) ? String(parsed.emotion) : fallback.emotion;
    const intent = INTENTS.has(String(parsed.intent)) ? String(parsed.intent) : fallback.intent;
    const responseStyle = STYLES.has(String(parsed.responseStyle)) ? String(parsed.responseStyle) : fallback.responseStyle;
    return {
      emotion,
      intent,
      confidence: clamp01(parsed.confidence, fallback.confidence),
      reason: String(parsed.reason ?? fallback.reason).trim() || fallback.reason,
      responseStyle,
    };
  } catch {
    return fallback;
  }
}

export function emotionInferenceToLiveAnalysis(inference: EmotionInference, message: string) {
  const toneMap: Record<string, string> = {
    nervous: 'supportive',
    confused: 'supportive',
    frustrated: 'supportive',
    sad: 'supportive',
    confident: 'positive',
    excited: 'positive',
    happy: 'positive',
    neutral: 'neutral',
  };
  return {
    summary: inference.reason,
    tone: toneMap[inference.emotion] ?? 'neutral',
    intent: inference.intent,
    emotion: inference.emotion,
    responseStyle: inference.responseStyle,
    confidence: inference.confidence,
    strengths: ['You are actively practicing in English.'],
    improvements:
      inference.intent === 'pronunciation_practice'
        ? ['Try Pronunciation Practice for focused coaching on problem sounds.']
        : inference.emotion === 'nervous' || inference.emotion === 'confused'
          ? ['Take your time — short clear sentences are perfectly fine.']
          : ['Keep building on your last idea with one more detail.'],
    suggested_reply:
      inference.intent === 'question'
        ? 'What made you curious about that?'
        : inference.intent === 'pronunciation_practice'
          ? 'Pick one word from that sentence and say it slowly twice.'
          : 'Tell me a bit more about that.',
    aiInferred: true,
    messagePreview: String(message || '').slice(0, 120),
  };
}

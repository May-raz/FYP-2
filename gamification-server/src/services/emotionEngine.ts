export interface TypingMetrics {
  typingStartTs?: number;
  sendTs?: number;
  typingDurationMs?: number;
  backspaceCount?: number;
  messageLength?: number;
  avgPauseMs?: number;
}

export interface VoiceMetrics {
  speechDurationMs?: number;
  silenceDurationMs?: number;
  wordsPerMinute?: number;
  fillerCount?: number;
}

export interface EmotionState {
  confidence: number;
  nervousness: number;
  frustration: number;
  engagement: number;
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function estimateSentiment(message: string): number {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return 0;
  const positive = ['good', 'great', 'thanks', 'awesome', 'love', 'happy', 'nice', 'cool'];
  const negative = ['bad', 'hate', 'angry', 'frustrated', 'stupid', 'hell', 'annoyed', 'confused'];
  let score = 0;
  for (const w of positive) if (text.includes(w)) score += 0.12;
  for (const w of negative) if (text.includes(w)) score -= 0.16;
  return Math.max(-1, Math.min(1, score));
}

export function computeEmotionState(input: {
  message: string;
  typingMetrics?: TypingMetrics;
  voiceMetrics?: VoiceMetrics;
  textSignals?: { sentimentScore?: number; grammarMistakeFrequency?: number };
}): EmotionState {
  const t = input.typingMetrics ?? {};
  const v = input.voiceMetrics ?? {};
  const sentiment = typeof input.textSignals?.sentimentScore === 'number'
    ? input.textSignals.sentimentScore
    : estimateSentiment(input.message);
  const grammarMistakeFrequency = Number(input.textSignals?.grammarMistakeFrequency ?? 0);
  const avgPause = Number(t.avgPauseMs ?? 0);
  const backspaces = Number(t.backspaceCount ?? 0);
  const msgLen = Number(t.messageLength ?? String(input.message || '').length);
  const wpm = Number(v.wordsPerMinute ?? 0);
  const filler = Number(v.fillerCount ?? 0);
  const speechDuration = Number(v.speechDurationMs ?? 0);
  const silenceDuration = Number(v.silenceDurationMs ?? 0);

  let confidence = 55;
  let nervousness = 30;
  let frustration = 20;
  let engagement = 55;

  if (avgPause > 850) nervousness += 15;
  if (backspaces >= 5) nervousness += 12;
  if (backspaces >= 8) confidence -= 10;
  if (speechDuration > 0 && silenceDuration > speechDuration * 0.5) nervousness += 10;
  if (wpm > 90 && wpm < 165) confidence += 10;
  if (wpm > 0 && wpm < 70) confidence -= 8;
  if (filler >= 3) nervousness += 8;
  if (sentiment < -0.25) frustration += 18;
  if (sentiment > 0.2) confidence += 8;
  if (grammarMistakeFrequency > 0.35) confidence -= 8;
  if (msgLen > 80) engagement += 10;
  if (msgLen < 12) engagement -= 10;

  confidence -= nervousness * 0.12;
  frustration += nervousness * 0.08;
  engagement -= frustration * 0.08;

  return {
    confidence: clamp(confidence),
    nervousness: clamp(nervousness),
    frustration: clamp(frustration),
    engagement: clamp(engagement),
  };
}

export function buildAdaptiveInstruction(state: EmotionState): string {
  const rules: string[] = [];
  if (state.nervousness > 70) rules.push('Use short sentences, simple vocabulary, and encouragement.');
  if (state.confidence > 70) rules.push('Increase difficulty and ask deeper follow-up questions.');
  if (state.frustration > 60) rules.push('Reduce correction intensity and simplify explanations.');
  if (state.engagement < 40) rules.push('Use interactive prompts and role-play style hooks.');
  if (!rules.length) rules.push('Keep a balanced tutor tone with one clear next step.');
  return rules.join(' ');
}


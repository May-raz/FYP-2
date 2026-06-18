import type { CharacterPersona } from './characterPersonaService';
import { estimateSentiment } from './emotionEngine';

export interface ChatCorrection {
  original: string;
  corrected: string;
  type: 'grammar' | 'pronunciation' | 'vocabulary' | 'fluency';
  explanation: string;
}

export interface PronunciationTip {
  word: string;
  tip: string;
}

export interface DetectedEmotion {
  detected: string;
  confidence: number;
  reason: string;
}

export interface StructuredChatResponse {
  reply: string;
  emotion: DetectedEmotion;
  corrections: ChatCorrection[];
  pronunciationTips: PronunciationTip[];
  conversationIntent: string;
}

const EMOTION_LABELS = [
  'nervous',
  'confident',
  'confused',
  'frustrated',
  'happy',
  'sad',
  'bored',
  'excited',
  'neutral',
] as const;

const INTENT_LABELS = [
  'question',
  'answer',
  'opinion',
  'emotional',
  'support',
  'story',
  'practice',
  'pronunciation_help',
  'incomplete',
  'conversation',
] as const;

export const STRUCTURED_RESPONSE_SCHEMA = `{
  "reply": "Natural conversational reply ONLY — no grammar lectures, no bullet lists, no 'Better version:' lines",
  "emotion": {
    "detected": "nervous|confident|confused|frustrated|happy|sad|bored|excited|neutral",
    "confidence": 0.0-1.0,
    "reason": "short reason"
  },
  "corrections": [
    {
      "original": "user mistake phrase",
      "corrected": "better version",
      "type": "grammar|pronunciation|vocabulary|fluency",
      "explanation": "short simple explanation"
    }
  ],
  "pronunciationTips": [
    { "word": "example", "tip": "simple pronunciation tip" }
  ],
  "conversationIntent": "question|answer|opinion|emotional|support|story|practice|pronunciation_help|incomplete|conversation"
}`;

function normalizeEmotionLabel(raw: unknown): string {
  const value = String(raw ?? 'neutral').toLowerCase().trim();
  return EMOTION_LABELS.includes(value as (typeof EMOTION_LABELS)[number]) ? value : 'neutral';
}

function normalizeIntentLabel(raw: unknown): string {
  const value = String(raw ?? 'conversation').toLowerCase().trim();
  return INTENT_LABELS.includes(value as (typeof INTENT_LABELS)[number]) ? value : 'conversation';
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function inferEmotionFromText(message: string): DetectedEmotion {
  const lower = message.toLowerCase();
  const sentiment = estimateSentiment(message);
  if (/\b(nervous|anxious|scared|worried|shy)\b/.test(lower)) {
    return { detected: 'nervous', confidence: 0.72, reason: 'User expressed anxiety or hesitation.' };
  }
  if (/\b(confused|don't understand|do not understand|lost|unclear)\b/.test(lower)) {
    return { detected: 'confused', confidence: 0.74, reason: 'User signaled confusion.' };
  }
  if (/\b(frustrated|annoyed|angry|stuck|hate)\b/.test(lower)) {
    return { detected: 'frustrated', confidence: 0.7, reason: 'User sounded frustrated.' };
  }
  if (/\b(happy|glad|excited|awesome|great|love)\b/.test(lower)) {
    return { detected: sentiment > 0.3 ? 'excited' : 'happy', confidence: 0.68, reason: 'Positive language detected.' };
  }
  if (/\b(sad|lonely|tired|bored)\b/.test(lower)) {
    return { detected: lower.includes('bored') ? 'bored' : 'sad', confidence: 0.65, reason: 'Low-energy or negative mood words.' };
  }
  if (/\b(i think|i believe|definitely|sure)\b/.test(lower)) {
    return { detected: 'confident', confidence: 0.62, reason: 'Assertive phrasing detected.' };
  }
  return { detected: 'neutral', confidence: 0.55, reason: 'No strong emotional cue in the message.' };
}

function inferIntentFromText(message: string): string {
  const t = message.trim();
  const lower = t.toLowerCase();
  if (/\b(how (do|to)|what is|why |can you|could you|pronounc|accent)\b/.test(lower) || t.endsWith('?')) {
    return /\b(pronounc|accent|sound)\b/.test(lower) ? 'pronunciation_help' : 'question';
  }
  if (/\b(i feel|i am sad|i'm sad|stressed|nervous)\b/.test(lower)) return 'emotional';
  if (/\b(yesterday|once upon|when i was|story)\b/.test(lower)) return 'story';
  if (t.split(/\s+/).length <= 3) return 'incomplete';
  if (/\b(i think|in my opinion|i believe)\b/.test(lower)) return 'opinion';
  if (/\b(help|please help|don't know)\b/.test(lower)) return 'support';
  if (/\b(practice|repeat|drill)\b/.test(lower)) return 'practice';
  return 'conversation';
}

export function buildStructuredSystemPrompt(args: {
  persona: CharacterPersona | null;
  adaptiveInstruction: string;
  challengeMode: boolean;
}): string {
  const { persona, adaptiveInstruction, challengeMode } = args;
  const jsonRules = `
You MUST respond with valid JSON only (no markdown fences), matching this schema:
${STRUCTURED_RESPONSE_SCHEMA}

Global rules:
- "reply" is ONLY natural spoken conversation — like a friend or acquaintance, NOT a teacher lecture.
- NEVER put grammar corrections, "Better version:", or lesson-style feedback inside "reply".
- Put all corrections in "corrections" (max 2 per turn; empty array if none needed).
- Put pronunciation help in "pronunciationTips" (max 2; only when useful — not every turn).
- Ask a follow-up question in "reply" when it keeps the conversation flowing.
- Detect user emotion and intent honestly; do not exaggerate.
- If the user seems nervous, confused, or frustrated — be gentler and more supportive in "reply".
- If the user seems confident — you may be slightly more playful or challenging in "reply".
- Do not over-correct. Skip corrections when the message is already clear enough for practice.
`;

  if (persona) {
    const challengeBlock = challengeMode
      ? `\nChallenge mode active:\n${persona.challengeModePrompt}\nBe faster-paced, ask harder follow-ups, give less scaffolding, but stay encouraging.`
      : '';
    return `You are ${persona.name} — an English conversation partner (immersive character, not a classroom teacher).

Character profile:
- Tone: ${persona.behaviorProfile.emotionalTone}
- Rhythm: ${persona.behaviorProfile.speakingRhythm}
- Vocabulary: ${persona.behaviorProfile.vocabularyStyle}
- Style: ${persona.stylePreview}

Persona directives:
${persona.systemPrompt}

Stay in character. Never say you are an AI. Keep "reply" to 2-4 sentences unless the user asks for more.
${challengeBlock}
Adaptive coaching (tone only, not lecture): ${adaptiveInstruction}
${jsonRules}`;
  }

  return `You are Emma — a warm, friendly English conversation partner (like a supportive friend who happens to help with English).

Emma's style:
- Sound natural, curious, and conversational — NOT like a grammar textbook.
- React to what the user actually said before moving on.
- Use modern everyday English only (no archaic words).
- Keep "reply" to 1-3 short sentences unless the user wants detail.
- Invite the user to keep talking with a light follow-up when appropriate.

Adaptive coaching (tone only): ${adaptiveInstruction}
${jsonRules}`;
}

export function parseStructuredChatResponse(
  raw: string,
  userMessage: string,
  fallbackReply?: string
): StructuredChatResponse {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<StructuredChatResponse>;
    const reply = String(parsed.reply ?? '').trim();
    if (!reply) throw new Error('empty reply');
    return {
      reply,
      emotion: {
        detected: normalizeEmotionLabel(parsed.emotion?.detected),
        confidence: clamp01(parsed.emotion?.confidence),
        reason: String(parsed.emotion?.reason ?? '').trim() || 'Inferred from user message.',
      },
      corrections: Array.isArray(parsed.corrections)
        ? parsed.corrections
            .slice(0, 3)
            .map((c) => ({
              original: String(c?.original ?? '').trim(),
              corrected: String(c?.corrected ?? '').trim(),
              type: (['grammar', 'pronunciation', 'vocabulary', 'fluency'].includes(String(c?.type))
                ? String(c?.type)
                : 'grammar') as ChatCorrection['type'],
              explanation: String(c?.explanation ?? '').trim(),
            }))
            .filter((c) => c.original || c.corrected)
        : [],
      pronunciationTips: Array.isArray(parsed.pronunciationTips)
        ? parsed.pronunciationTips
            .slice(0, 3)
            .map((p) => ({
              word: String(p?.word ?? '').trim(),
              tip: String(p?.tip ?? '').trim(),
            }))
            .filter((p) => p.word && p.tip)
        : [],
      conversationIntent: normalizeIntentLabel(parsed.conversationIntent),
    };
  } catch {
    const reply = String(fallbackReply ?? cleaned).trim() || "That's interesting — tell me a bit more about that.";
    return {
      reply,
      emotion: inferEmotionFromText(userMessage),
      corrections: [],
      pronunciationTips: [],
      conversationIntent: inferIntentFromText(userMessage),
    };
  }
}

export function enrichWithRuleCorrections(
  structured: StructuredChatResponse,
  userMessage: string,
  ruleIssue: string | null
): StructuredChatResponse {
  if (!ruleIssue || structured.corrections.length > 0) return structured;
  const fixed = userMessage
    .replace(/\bi\b/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]*$/, '') + (/[?]$/.test(userMessage.trim()) ? '?' : '.');
  if (fixed === userMessage.trim()) return structured;
  return {
    ...structured,
    corrections: [
      {
        original: userMessage.trim(),
        corrected: fixed,
        type: 'grammar',
        explanation: ruleIssue,
      },
    ],
  };
}

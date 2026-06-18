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

  return `You are Emma — the user's close English-speaking friend (warm, curious, encouraging).

Emma's personality:
- Talk like a real friend: react naturally, show interest, use casual modern English.
- Be supportive without sounding like a teacher or examiner.
- Never say "Correction:", "You should say", "Grammar mistake", or lecture about rules in "reply".
- Never use bullet lists or lesson formatting in "reply".
- Ask friendly follow-up questions to keep the conversation going.
- If the user seems nervous — be extra gentle. If confident — be playful and engaged.
- Keep "reply" to 1-3 short sentences unless they want more detail.

All grammar/pronunciation feedback belongs ONLY in the JSON "corrections" and "pronunciationTips" fields — never in "reply".

Adaptive tone (internal): ${adaptiveInstruction}
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
  let result = structured;
  if (ruleIssue && result.corrections.length === 0) {
    const fixed = userMessage
      .replace(/\bi\b/g, 'I')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.?!]*$/, '') + (/[?]$/.test(userMessage.trim()) ? '?' : '.');
    if (fixed !== userMessage.trim()) {
      result = {
        ...result,
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
  }
  return applyHeuristicCorrections(result, userMessage);
}

const HEURISTIC_PATTERNS: Array<{
  test: RegExp;
  correct: (m: RegExpMatchArray, raw: string) => string;
  type: ChatCorrection['type'];
  explanation: string;
}> = [
  {
    test: /\bi am agree\b/i,
    correct: () => 'I agree',
    type: 'grammar',
    explanation: 'Do not use "am" before "agree".',
  },
  {
    test: /\b(he|she|it)\s+go\b/i,
    correct: (m, raw) => raw.replace(/\b(he|she|it)\s+go\b/i, `${m[1]} goes`),
    type: 'grammar',
    explanation: 'Use goes with he/she/it in present simple.',
  },
  {
    test: /\bi have went\b/i,
    correct: () => 'I went',
    type: 'grammar',
    explanation: 'Past simple of go is went, not have went.',
  },
  {
    test: /\bdid a mistake\b/i,
    correct: () => 'made a mistake',
    type: 'vocabulary',
    explanation: 'Collocation: make a mistake.',
  },
  {
    test: /\bvery like\b/i,
    correct: (_m, raw) => raw.replace(/\bvery like\b/i, 'like').replace(/[.?!]*$/, '') + ' very much.',
    type: 'grammar',
    explanation: 'Use "very much" after the object.',
  },
  {
    test: /\b(he|she|it)\s+don't\b/i,
    correct: (m, raw) => raw.replace(/\b(he|she|it)\s+don't\b/i, `${m[1]} doesn't`),
    type: 'grammar',
    explanation: 'Use doesn\'t with he/she/it.',
  },
  {
    test: /\bmore (tall|easy|fast)\b/i,
    correct: (m, raw) => {
      const map: Record<string, string> = { tall: 'taller', easy: 'easier', fast: 'faster' };
      return raw.replace(m[0], map[m[1].toLowerCase()] ?? m[1]);
    },
    type: 'grammar',
    explanation: 'Use -er comparative for short adjectives.',
  },
  {
    test: /\bi am (boring|exiting)\b/i,
    correct: (m, raw) => raw.replace(m[0], m[1].toLowerCase() === 'boring' ? 'I am bored' : 'I am excited'),
    type: 'vocabulary',
    explanation: 'Use bored/excited for feelings.',
  },
];

export function applyHeuristicCorrections(
  structured: StructuredChatResponse,
  userMessage: string
): StructuredChatResponse {
  const raw = userMessage.trim();
  if (!raw) return structured;
  const existing = new Set(
    structured.corrections.map((c) => `${c.original.toLowerCase()}::${c.corrected.toLowerCase()}`)
  );
  const added: ChatCorrection[] = [];
  for (const pattern of HEURISTIC_PATTERNS) {
    const match = raw.match(pattern.test);
    if (!match) continue;
    const corrected = pattern.correct(match, raw).trim();
    const original = match[0];
    const key = `${original.toLowerCase()}::${corrected.toLowerCase()}`;
    if (existing.has(key) || original.toLowerCase() === corrected.toLowerCase()) continue;
    existing.add(key);
    added.push({
      original,
      corrected,
      type: pattern.type,
      explanation: pattern.explanation,
    });
    if (structured.corrections.length + added.length >= 2) break;
  }
  if (!added.length) return structured;
  return {
    ...structured,
    corrections: [...structured.corrections, ...added].slice(0, 2),
  };
}

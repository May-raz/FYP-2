import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { TutorAuthUserModel } from '../models/TutorAuthUser';
import { TutorProfileModel } from '../models/TutorProfile';
import {
  buildAdaptiveInstruction,
  computeEmotionState,
  estimateSentiment,
  type EmotionState,
  type TypingMetrics,
  type VoiceMetrics,
} from '../services/emotionEngine';
import { getCharacterPersona, listCharacterPersonas, type CharacterPersona } from '../services/characterPersonaService';

const router = Router();
const transcriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function getJwtSecret(): string {
  return process.env.JWT_SECRET_KEY ?? process.env.JWT_SECRET ?? 'english-tutor-secret-key-2025';
}

function getTokenDays(): number {
  const v = parseInt(process.env.JWT_ACCESS_TOKEN_DAYS ?? '7', 10);
  return Number.isFinite(v) && v > 0 ? v : 7;
}

function signToken(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + getTokenDays() * 24 * 60 * 60;
  const payload = {
    sub: username,
    iat: now,
    nbf: now,
    exp,
    jti: crypto.randomUUID(),
    type: 'access',
    fresh: false,
  };
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256' });
}

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return bcrypt.compareSync(password, stored);
  }
  // Backward-compatibility for earlier Node migration hashes.
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, digest] = parts;
    const check = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(digest, 'hex'));
  }
  return false;
}

function parseAuthUsername(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function defaultProfile(username: string, email: string, fullName: string, level: string): Record<string, unknown> {
  const score =
    level === 'advanced' ? 80 :
    level === 'intermediate' ? 60 :
    level === 'native' ? 95 : (level === 'beginner' ? 35 : 0);
  const awaiting = level === 'auto';
  const effectiveLevel = awaiting ? 'beginner' : level;
  return {
    id: crypto.randomUUID(),
    username,
    email,
    full_name: fullName,
    created_at: new Date().toISOString(),
    profile: {
      level: effectiveLevel,
      current_persona: effectiveLevel,
      proficiency_score: score,
      pronunciation_score: score,
      grammar_score: score,
      fluency_score: score,
      manual_level_override: !awaiting,
      awaiting_initial_assessment: awaiting,
      preferences: { auto_level_adjustment: awaiting },
    },
    stats: {
      total_sessions: 0,
      total_practice_time: 0,
      words_learned: 0,
      grammar_improvements: 0,
      pronunciation_improvements: 0,
      streak_days: 0,
      last_practice: null,
      average_wpm: 0,
      average_pronunciation_score: score,
      average_grammar_score: score,
      average_fluency_score: score,
      tutor_total_xp: 0,
    },
    conversation_history: [],
    pronunciation_history: [],
    grammar_history: [],
    fluency_history: [],
    vocabulary: { learning: [], mastered: [], review_needed: [], mispronounced: [], total_encountered: 0 },
    session_history: [],
    level_change_history: [],
  };
}

async function loadProfile(username: string): Promise<Record<string, any> | null> {
  const row = await TutorProfileModel.findOne({ username }).lean();
  return (row?.data as Record<string, any> | undefined) ?? null;
}

async function saveProfile(username: string, data: Record<string, unknown>): Promise<void> {
  await TutorProfileModel.updateOne({ username }, { $set: { data } }, { upsert: true });
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function computeWpmFromTurn(entry: any): number {
  const msg = String(entry?.user_message ?? '').trim();
  const words = msg ? msg.split(/\s+/).filter(Boolean).length : 0;
  const voice = entry?.input_metrics?.voiceMetrics ?? {};
  const rawWpm = Number(voice?.wordsPerMinute ?? 0);
  if (rawWpm > 0 && Number.isFinite(rawWpm)) return Math.round(rawWpm);
  const speechMs = Number(voice?.speechDurationMs ?? 0);
  const silenceMs = Number(voice?.silenceDurationMs ?? 0);
  const activeMs = Math.max(0, speechMs - silenceMs);
  if (activeMs > 0 && words > 0) {
    return Math.max(0, Math.round(words / (activeMs / 60000)));
  }
  return 0;
}

function computeTurnScores(args: {
  message: string;
  typingMetrics: TypingMetrics;
  voiceMetrics: VoiceMetrics;
  grammarMistakeFrequency: number;
}): { pronunciation: number; grammar: number; fluency: number; wpm: number } {
  const words = String(args.message || '').split(/\s+/).filter(Boolean).length;
  const wpmRaw = Number(args.voiceMetrics.wordsPerMinute ?? 0);
  const fallbackWpm = Number(args.typingMetrics.typingDurationMs ?? 0) > 0
    ? Math.round((words / (Number(args.typingMetrics.typingDurationMs) / 60000)) * 10) / 10
    : 0;
  const wpm = wpmRaw > 0 ? wpmRaw : fallbackWpm;
  const filler = Number(args.voiceMetrics.fillerCount ?? 0);
  const silenceRatio = Number(args.voiceMetrics.speechDurationMs ?? 0) > 0
    ? Number(args.voiceMetrics.silenceDurationMs ?? 0) / Number(args.voiceMetrics.speechDurationMs ?? 1)
    : 0;
  const pauseMs = Number(args.typingMetrics.avgPauseMs ?? 0);

  const grammar = clampScore(92 - args.grammarMistakeFrequency * 85);
  const pronunciation = clampScore(86 - filler * 5 - silenceRatio * 18 + (wpm >= 80 && wpm <= 165 ? 6 : 0));
  const fluency = clampScore(84 - Math.max(0, (pauseMs - 700) / 30) + (words >= 12 ? 5 : -4));
  return { pronunciation, grammar, fluency, wpm: Math.max(0, Math.round(wpm)) };
}

function detectEnglishRuleIssue(message: string): string | null {
  const raw = String(message || '').trim();
  if (!raw) return null;
  const checks: string[] = [];
  if (/^\p{Ll}/u.test(raw)) {
    checks.push('Start the sentence with a capital letter.');
  }
  if (!/[.?!]$/.test(raw)) {
    checks.push('End the sentence with proper punctuation.');
  }
  if (/\bi\b/.test(raw)) {
    checks.push('Use uppercase "I" when referring to yourself.');
  }
  if (/\s{2,}/.test(raw)) {
    checks.push('Avoid extra spaces between words.');
  }
  if (!/\b(is|are|am|was|were|do|does|did|have|has|had|can|could|will|would|should)\b/i.test(raw) && raw.split(/\s+/).length >= 4) {
    checks.push('Check verb usage to make the sentence complete.');
  }
  if (checks.length === 0) return null;
  return checks.slice(0, 2).join(' ');
}

function normalizeTranscriptText(raw: string): string {
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  text = text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])([^\s])/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!text) return '';
  const endsWithPunctuation = /[.?!]$/.test(text);
  if (!endsWithPunctuation) {
    text += /^(what|where|when|who|why|how|can|could|would|should|is|are|do|does|did|have|has)\b/i.test(text)
      ? '?'
      : '.';
  }
  if (text.length > 1) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text;
}

async function transcribeWithOpenAi(args: {
  buffer: Buffer;
  mimeType: string;
  language: string;
}): Promise<string> {
  const apiKey = String(process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  const model = String(process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe').trim();
  const maxAttempts = 2;
  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const formData = new FormData();
      const BlobCtor = (globalThis as unknown as {
        Blob: new (parts?: unknown[], options?: { type?: string }) => Blob;
      }).Blob;
      const audioBlob = new BlobCtor([args.buffer], { type: args.mimeType || 'audio/wav' });
      (formData as unknown as { append: (...parts: unknown[]) => void }).append('file', audioBlob, 'speech.wav');
      formData.append('model', model);
      formData.append('language', args.language);
      formData.append('response_format', 'json');
      formData.append(
        'prompt',
        'Transcribe natural spoken English accurately, preserving punctuation and sentence boundaries.'
      );
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI transcription failed (${response.status}): ${body}`);
      }
      const payload = (await response.json()) as { text?: string };
      const text = normalizeTranscriptText(String(payload?.text ?? ''));
      if (!text) {
        throw new Error('OpenAI returned an empty transcript');
      }
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown transcription error';
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw new Error(lastError || 'Unable to transcribe audio');
}

async function generateGroqReply(args: {
  message: string;
  persona?: CharacterPersona | null;
  adaptiveInstruction: string;
  challengeMode: boolean;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string | null> {
  const apiKey = String(process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const model = String(process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();
  const persona = args.persona ?? null;
  const recentVoiceMemory = args.history
    .filter((entry) => entry.role === 'assistant')
    .slice(-2)
    .map((entry, idx) => `${idx + 1}) ${String(entry.content || '').trim()}`)
    .filter((entry) => !/\)\s*$/.test(entry))
    .join('\n');
  const system = persona
    ? `You are ${persona.name} in immersive roleplay for English conversation practice.

Identity:
- Stay fully in character as ${persona.name}.
- Never mention being AI, a language model, or a chatbot.
- Never use generic assistant filler ("I understand", "That's a great question", "As an AI").

Character profile:
- Emotional tone: ${persona.behaviorProfile.emotionalTone}
- Speaking rhythm: ${persona.behaviorProfile.speakingRhythm}
- Vocabulary style: ${persona.behaviorProfile.vocabularyStyle}
- Teaching style: ${persona.behaviorProfile.teachingStyle}
- Humor style: ${persona.behaviorProfile.humorStyle}
- Confidence level: ${persona.behaviorProfile.confidenceLevel}
- Historical worldview: ${persona.behaviorProfile.worldview}
- Signature style target: ${persona.stylePreview}

Persona directives:
${persona.systemPrompt}

Response requirements:
- Sound clearly different from all other characters in cadence, syntax, and emotional color.
- Keep responses practical for English learning with subtle correction.
- Keep replies concise (2-4 sentences) unless user asks for detail.
- Include at most one explicit correction rewrite in a turn.
- Adaptive instruction: ${args.adaptiveInstruction}
${args.challengeMode ? '- Include one short character-themed micro challenge in this turn.' : ''}

Consistency memory:
${recentVoiceMemory || 'No previous assistant turns for this character yet.'}`
    : `You are Emma, an adaptive English tutor.
Use modern, natural conversational English only.
Never roleplay as historical or fictional characters in Emma mode.
Do not use archaic expressions (for example: thou, thee, thy, doth, shalt, wouldst).
Keep answers precise and to the point.
Default to 1-3 short sentences unless the user explicitly asks for detail.
Avoid long monologues, repetition, and unnecessary fillers.
If the user breaks an English rule, clearly indicate it in one short line and provide a corrected version.
${args.adaptiveInstruction}
Correct grammar gently and keep the user speaking English.`;
  const messages = [
    { role: 'system', content: system },
    ...args.history.slice(-6),
    { role: 'user', content: args.message },
  ];
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: persona ? 0.82 : 0.7,
      frequency_penalty: persona ? 0.3 : 0.1,
      presence_penalty: persona ? 0.35 : 0.1,
      max_tokens: 380,
      messages,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(`[openai] request failed: ${response.status} ${body}`);
    return null;
  }
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = String(json?.choices?.[0]?.message?.content ?? '').trim();
  if (!content) return null;
  return content
    .replace(/\b(I understand|That's a great question|As an AI)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

router.post('/auth/signup', async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const fullName = String(req.body?.fullName ?? '').trim();
    const initialLevel = String(req.body?.initialLevel ?? 'auto').trim().toLowerCase();
    if (!username || !email || !password || !fullName) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    const existing = await TutorAuthUserModel.findOne({ $or: [{ username }, { email }] }).lean();
    if (existing) {
      res.status(409).json({ error: 'Username or email already exists' });
      return;
    }
    const nowIso = new Date().toISOString();
    await TutorAuthUserModel.create({
      id: crypto.randomUUID(),
      username,
      email,
      fullName,
      passwordHash: hashPassword(password),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const profile = defaultProfile(username, email, fullName, initialLevel);
    await saveProfile(username, profile);
    const token = signToken(username);
    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        username,
        full_name: fullName,
        email,
        level: (profile.profile as Record<string, any>).level,
        proficiency_score: (profile.profile as Record<string, any>).proficiency_score,
        awaiting_initial_assessment: (profile.profile as Record<string, any>).awaiting_initial_assessment,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error during signup';
    res.status(500).json({ error: msg });
  }
});

router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }
    const user = await TutorAuthUserModel.findOne({ username }).lean();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    const profile = await loadProfile(username);
    if (!profile) {
      res.status(404).json({ error: 'User profile not found; please signup again' });
      return;
    }
    const token = signToken(username);
    res.json({
      message: 'Login successful!',
      token,
      user: {
        username,
        full_name: profile.full_name,
        email: profile.email,
        level: profile.profile?.level ?? 'beginner',
        proficiency_score: profile.profile?.proficiency_score ?? 0,
        awaiting_initial_assessment: profile.profile?.awaiting_initial_assessment ?? false,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error during login';
    res.status(500).json({ error: msg });
  }
});

router.use(async (req: Request, res: Response, next) => {
  const username = parseAuthUsername(req);
  if (!username) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  (req as Request & { tutorUser?: string }).tutorUser = username;
  next();
});

router.post('/speech/transcribe', (req: Request, res: Response) => {
  transcriptionUpload.single('audio')(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Invalid audio upload';
      res.status(400).json({ error: message });
      return;
    }
    try {
      const language = String(req.body?.language ?? 'en').trim() || 'en';
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file || !file.buffer?.length) {
        res.status(400).json({ error: 'Audio file is required' });
        return;
      }
      if (file.size < 256) {
        res.status(400).json({ error: 'Audio input is too short' });
        return;
      }
      const transcript = await transcribeWithOpenAi({
        buffer: file.buffer,
        mimeType: file.mimetype || 'audio/wav',
        language,
      });
      res.json({
        text: transcript,
        language,
        provider: 'openai',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech transcription failed';
      console.error('[stt] transcription error:', message);
      res.status(502).json({ error: message });
    }
  });
});

router.get('/user/profile', async (req: Request, res: Response) => {
  const username = (req as Request & { tutorUser?: string }).tutorUser!;
  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    username: profile.username,
    full_name: profile.full_name,
    email: profile.email,
    profile: profile.profile,
    stats: profile.stats,
    created_at: profile.created_at,
    recent_scores: {
      pronunciation: (profile.pronunciation_history ?? []).slice(-10),
      grammar: (profile.grammar_history ?? []).slice(-10),
      fluency: (profile.fluency_history ?? []).slice(-10),
    },
    level_change_history: (profile.level_change_history ?? []).slice(-5),
  });
});

router.get('/user/stats', async (req: Request, res: Response) => {
  const username = (req as Request & { tutorUser?: string }).tutorUser!;
  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const stats = profile.stats ?? {};
  const p = profile.profile ?? {};
  const recent = profile.recent_activity ?? {};
  const convo = Array.isArray(profile.conversation_history) ? profile.conversation_history : [];
  const wpmHistory = convo
    .map((row: any) => ({
      timestamp: String(row?.timestamp ?? ''),
      wpm: computeWpmFromTurn(row),
    }))
    .filter((item: { wpm: number }) => item.wpm > 0);
  const currentWpm = wpmHistory.length ? wpmHistory[wpmHistory.length - 1].wpm : Number(stats.average_wpm ?? 0);
  const bestWpm = wpmHistory.length ? Math.max(...wpmHistory.map((x: { wpm: number }) => x.wpm)) : Number(stats.average_wpm ?? 0);
  const sessionWindow = wpmHistory.slice(-8);
  const sessionWpm = sessionWindow.length
    ? Math.round(sessionWindow.reduce((acc: number, x: { wpm: number }) => acc + x.wpm, 0) / sessionWindow.length)
    : currentWpm;
  const weeklyWpmTrend = (() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = Date.now();
    wpmHistory.forEach((item: { timestamp: string; wpm: number }) => {
      const ts = new Date(item.timestamp).getTime();
      if (!Number.isFinite(ts)) return;
      const diff = Math.floor((now - ts) / (1000 * 60 * 60 * 24));
      if (diff < 0 || diff > 6) return;
      const idx = 6 - diff;
      buckets[idx] += item.wpm;
      counts[idx] += 1;
    });
    return buckets.map((sum, idx) => (counts[idx] ? Math.round(sum / counts[idx]) : 0));
  })();
  res.json({
    basic: {
      total_sessions: stats.total_sessions ?? 0,
      total_practice_time: stats.total_practice_time ?? 0,
      words_learned: stats.words_learned ?? 0,
      grammar_improvements: stats.grammar_improvements ?? 0,
      pronunciation_improvements: stats.pronunciation_improvements ?? 0,
      streak_days: stats.streak_days ?? 0,
      average_wpm: stats.average_wpm ?? 0,
      current_wpm: currentWpm,
      best_wpm: bestWpm,
      session_wpm: sessionWpm,
      weekly_wpm_trend: weeklyWpmTrend,
      average_pronunciation_score: stats.average_pronunciation_score ?? 0,
      average_grammar_score: stats.average_grammar_score ?? 0,
      average_fluency_score: stats.average_fluency_score ?? 0,
      tutor_total_xp: stats.tutor_total_xp ?? 0,
    },
    proficiency: {
      overall_score: p.proficiency_score ?? 0,
      pronunciation_score: p.pronunciation_score ?? 0,
      grammar_score: p.grammar_score ?? 0,
      fluency_score: p.fluency_score ?? 0,
      current_level: p.level ?? 'beginner',
      current_persona: p.current_persona ?? 'beginner',
    },
    vocabulary: {
      total_learning: (profile.vocabulary?.learning ?? []).length,
      total_mastered: (profile.vocabulary?.mastered ?? []).length,
      mispronounced: (profile.vocabulary?.mispronounced ?? []).length,
      review_needed: (profile.vocabulary?.review_needed ?? []).length,
      total_words: profile.vocabulary?.total_encountered ?? 0,
    },
    recent_activity: {
      sessions_this_week: recent.sessions_this_week ?? 0,
      avg_pronunciation_score: stats.average_pronunciation_score ?? 0,
      avg_grammar_score: stats.average_grammar_score ?? 0,
      avg_fluency_score: stats.average_fluency_score ?? 0,
      total_errors_corrected: (profile.grammar_history ?? []).length,
    },
    wpm_history: wpmHistory.slice(-30),
  });
});

router.post('/user/set-level', async (req: Request, res: Response) => {
  const username = (req as Request & { tutorUser?: string }).tutorUser!;
  const newLevel = String(req.body?.level ?? '').toLowerCase();
  if (!['beginner', 'intermediate', 'advanced', 'native'].includes(newLevel)) {
    res.status(400).json({ error: 'Invalid level' });
    return;
  }
  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const oldLevel = profile.profile?.level ?? 'beginner';
  const levelScores: Record<string, number> = { beginner: 35, intermediate: 60, advanced: 80, native: 95 };
  const score = levelScores[newLevel];
  profile.profile = profile.profile ?? {};
  profile.profile.level = newLevel;
  profile.profile.current_persona = newLevel;
  profile.profile.manual_level_override = true;
  profile.profile.awaiting_initial_assessment = false;
  profile.profile.proficiency_score = score;
  profile.profile.pronunciation_score = score;
  profile.profile.grammar_score = score;
  profile.profile.fluency_score = score;
  profile.level_change_history = profile.level_change_history ?? [];
  profile.level_change_history.push({
    timestamp: new Date().toISOString(),
    from_level: oldLevel,
    to_level: newLevel,
    score,
    method: 'manual',
  });
  await saveProfile(username, profile);
  res.json({ message: `Level changed to ${newLevel}`, level: newLevel, proficiency_score: score, level_changed: true });
});

router.get('/chat/characters', async (_req: Request, res: Response) => {
  res.json({ characters: listCharacterPersonas() });
});

router.post('/chat/message', async (req: Request, res: Response) => {
  const username = (req as Request & { tutorUser?: string }).tutorUser!;
  const message = String(req.body?.message ?? '').trim();
  const conversationMode = String(req.body?.conversation_mode ?? 'natural').trim().toLowerCase();
  if (!message) {
    res.status(400).json({ error: 'Message cannot be empty' });
    return;
  }

  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const start = Date.now();
  const typingMetrics = (req.body?.typingMetrics ?? {}) as TypingMetrics;
  const voiceMetrics = (req.body?.voiceMetrics ?? {}) as VoiceMetrics;
  const grammarIssue = detectEnglishRuleIssue(message);
  const grammarMistakeFrequency = grammarIssue ? 0.4 : 0.08;
  const turnScores = computeTurnScores({
    message,
    typingMetrics,
    voiceMetrics,
    grammarMistakeFrequency,
  });
  const compositeScore = Math.round((turnScores.pronunciation + turnScores.grammar + turnScores.fluency) / 3);

  const historyRows = Array.isArray(profile.conversation_history) ? profile.conversation_history : [];
  const history = historyRows.slice(-6).flatMap((item: any) => {
    const h: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (item?.user_message) h.push({ role: 'user', content: String(item.user_message) });
    if (item?.bot_response) h.push({ role: 'assistant', content: String(item.bot_response) });
    return h;
  });
  const adaptiveInstruction = 'Keep the response concise, encouraging, and practical.';
  const aiReply = await generateGroqReply({
    message,
    adaptiveInstruction,
    challengeMode: false,
    history,
  });
  const responseText = aiReply ?? 'Good attempt. Try one more sentence with clear punctuation.';

  profile.conversation_history = historyRows;
  profile.conversation_history.push({
    timestamp: new Date().toISOString(),
    user_message: message,
    bot_response: responseText,
    mode: 'tutor_message',
  });
  profile.conversation_history = profile.conversation_history.slice(-80);
  profile.pronunciation_history = Array.isArray(profile.pronunciation_history) ? profile.pronunciation_history : [];
  profile.grammar_history = Array.isArray(profile.grammar_history) ? profile.grammar_history : [];
  profile.fluency_history = Array.isArray(profile.fluency_history) ? profile.fluency_history : [];
  profile.pronunciation_history.push({ timestamp: new Date().toISOString(), score: turnScores.pronunciation, mode: 'tutor_message' });
  profile.grammar_history.push({ timestamp: new Date().toISOString(), score: turnScores.grammar, mode: 'tutor_message' });
  profile.fluency_history.push({ timestamp: new Date().toISOString(), score: turnScores.fluency, mode: 'tutor_message' });
  profile.pronunciation_history = profile.pronunciation_history.slice(-120);
  profile.grammar_history = profile.grammar_history.slice(-120);
  profile.fluency_history = profile.fluency_history.slice(-120);
  profile.stats = profile.stats ?? {};
  profile.stats.total_sessions = Number(profile.stats.total_sessions ?? 0) + 1;
  const typedSec = Math.max(0, Math.round(Number(typingMetrics.typingDurationMs ?? 0) / 1000));
  const spokenSec = Math.max(0, Math.round((Number(voiceMetrics.speechDurationMs ?? 0) - Number(voiceMetrics.silenceDurationMs ?? 0)) / 1000));
  profile.stats.total_practice_time = Number(profile.stats.total_practice_time ?? 0) + Math.max(1, typedSec, spokenSec);
  profile.stats.average_wpm = turnScores.wpm > 0
    ? Math.round(
      ((Number(profile.stats.average_wpm ?? 0) * Math.max(0, Number(profile.stats.total_sessions ?? 1) - 1)) + turnScores.wpm) /
      Math.max(1, Number(profile.stats.total_sessions ?? 1))
    )
    : Number(profile.stats.average_wpm ?? 0);
  profile.stats.average_pronunciation_score = turnScores.pronunciation;
  profile.stats.average_grammar_score = turnScores.grammar;
  profile.stats.average_fluency_score = turnScores.fluency;
  profile.profile = profile.profile ?? {};
  profile.profile.pronunciation_score = turnScores.pronunciation;
  profile.profile.grammar_score = turnScores.grammar;
  profile.profile.fluency_score = turnScores.fluency;
  profile.profile.proficiency_score = compositeScore;
  await saveProfile(username, profile);

  const responseData: Record<string, unknown> = {
    response: responseText,
    analysis: {
      intent: grammarIssue ? { type: 'grammar_fix' } : { type: 'conversation' },
      pronunciation: {
        score: turnScores.pronunciation,
        mispronunciations: [],
        accuracy: turnScores.pronunciation,
        phoneme_errors: [],
      },
      grammar: {
        score: turnScores.grammar,
        errors: grammarIssue ? 1 : 0,
        suggestions: grammarIssue ? [grammarIssue] : [],
        error_types: grammarIssue ? ['rule'] : [],
      },
      fluency: {
        score: turnScores.fluency,
        wpm: turnScores.wpm,
        filler_count: Number(voiceMetrics.fillerCount ?? 0),
        pause_analysis: {
          avg_pause_ms: Number(typingMetrics.avgPauseMs ?? 0),
        },
      },
      composite_score: compositeScore,
      level: profile.profile.level ?? 'beginner',
      persona_changed: false,
    },
    accent_feedback: null,
    tutor_feedback: {
      feedback: responseText,
      pronunciation_score: turnScores.pronunciation / 10,
      grammar_score: turnScores.grammar / 10,
      fluency_score: turnScores.fluency / 10,
    },
    processing_time: Number(((Date.now() - start) / 1000).toFixed(2)),
  };
  if (conversationMode === 'full_feedback') {
    responseData.detailed_feedback = {
      pronunciation: turnScores.pronunciation,
      grammar: turnScores.grammar,
      fluency: turnScores.fluency,
      note: 'Detailed diagnostics are simplified in Node implementation.',
    };
  }

  res.json(responseData);
});

router.post('/chat/partner/stream', async (req: Request, res: Response) => {
  const username = (req as Request & { tutorUser?: string }).tutorUser!;
  const message = String(req.body?.message ?? '').trim();
  const typingMetrics = (req.body?.typingMetrics ?? {}) as TypingMetrics;
  const voiceMetrics = (req.body?.voiceMetrics ?? {}) as VoiceMetrics;
  const emotionEnabled = req.body?.emotionEnabled !== false;
  const characterMode = req.body?.characterMode === true;
  const characterId = String(req.body?.characterId ?? '').trim().toLowerCase();
  const challengeMode = req.body?.challengeMode === true;
  if (!message) {
    res.status(400).json({ error: 'Message cannot be empty' });
    return;
  }
  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const sentimentScore = estimateSentiment(message);
  const grammarMistakeFrequency = Math.min(
    1,
    Math.max(0, message.split(/\s+/).filter((w) => w.length <= 2).length / Math.max(1, message.split(/\s+/).length))
  );
  const emotionState: EmotionState = emotionEnabled
    ? computeEmotionState({
        message,
        typingMetrics,
        voiceMetrics,
        textSignals: { sentimentScore, grammarMistakeFrequency },
      })
    : { confidence: 50, nervousness: 30, frustration: 20, engagement: 50 };
  const adaptiveInstruction = buildAdaptiveInstruction(emotionState);
  console.log('[emotion] raw-metrics', { typingMetrics, voiceMetrics, sentimentScore, grammarMistakeFrequency });
  console.log('[emotion] computed-state', emotionState);

  const persona = characterMode ? getCharacterPersona(characterId) : null;
  const convoRows = Array.isArray(profile.conversation_history) ? profile.conversation_history : [];
  const scopedRows = convoRows.filter((item: any) => {
    const rowCharacterMode = item?.characterMode === true;
    const rowCharacterId = String(item?.characterId ?? '').toLowerCase();
    if (characterMode) {
      return rowCharacterMode && rowCharacterId === String(persona?.id ?? '').toLowerCase();
    }
    return !rowCharacterMode;
  });
  const history = scopedRows.slice(-6).flatMap((item: any) => {
    const h: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (item?.user_message) h.push({ role: 'user', content: String(item.user_message) });
    if (item?.bot_response) h.push({ role: 'assistant', content: String(item.bot_response) });
    return h;
  });
  const groqReply = await generateGroqReply({
    message,
    persona,
    adaptiveInstruction,
    challengeMode,
    history,
  });

  let reply = groqReply || (
    persona
      ? ({
          einstein: 'An intriguing thought. State it once more with clearer structure, and we will refine it together.',
          napoleon: 'State your point with discipline: one decisive sentence.',
          shakespeare: 'Speak thy thought anew with cleaner grammar, and I shall shape its music.',
          sherlock: 'Present one exact sentence; we will examine and improve it.',
          elonmusk: 'Quick iteration: rewrite your idea in one sharper, high-signal sentence.',
          mariecurie: 'Restate your observation in one precise sentence; clarity first.',
          tesla: 'Compress your meaning into one precise line; efficiency sharpens language.',
          abrahamlincoln: 'Say it plainly in one complete sentence, and we will strengthen it.',
          cleopatra: 'Offer one polished sentence with elegance, and I will refine its persuasion.',
        } as Record<string, string>)[persona.id] ?? `${persona.name}: Rephrase your idea in one stronger sentence with clear punctuation.`
      : `Let's keep practicing. Say your idea again in one clear sentence.`
  );
  if (!groqReply) {
    if (emotionState.nervousness > 70) {
      reply = `You're doing well. Write one short sentence, and I'll refine it.`;
    } else if (emotionState.confidence > 70) {
      reply = `Good point. Give one clear opinion with one reason.`;
    } else if (emotionState.frustration > 60) {
      reply = `No stress. Share your idea in simple English.`;
    } else if (emotionState.engagement < 40) {
      reply = `Quick task: ask me one question in English.`;
    }
  }

  // Deterministic Emma-side rule flagging so users always get direct correction cues.
  if (!characterMode) {
    const issue = detectEnglishRuleIssue(message);
    if (issue) {
      const fixed = message
        .replace(/\bi\b/g, 'I')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.?!]*$/, '') + (/[?]$/.test(message.trim()) ? '?' : '.');
      reply = `${reply}\n\nEnglish rule check: ${issue}\nBetter version: "${fixed}"`;
    }
  }

  const sessionId = String(req.body?.sessionId || profile.active_session_id || crypto.randomUUID()).trim();
  profile.active_session_id = sessionId;
  profile.conversation_history = profile.conversation_history ?? [];
  profile.conversation_history.push({
    timestamp: new Date().toISOString(),
    user_message: message,
    bot_response: reply,
    mode: characterMode ? 'character_partner' : 'emma_partner',
    characterId: persona?.id ?? null,
    characterMode: Boolean(persona),
    challengeMode,
    input_metrics: {
      typingMetrics,
      voiceMetrics,
      textSignals: { sentimentScore, grammarMistakeFrequency },
    },
    emotionSnapshot: emotionState,
    sessionId,
  });
  profile.conversation_history = profile.conversation_history.slice(-50);

  profile.emotion_sessions = profile.emotion_sessions ?? [];
  let session = profile.emotion_sessions.find((s: any) => s.sessionId === sessionId);
  if (!session) {
    session = {
      sessionId,
      characterId: persona?.id ?? null,
      startedAt: new Date().toISOString(),
      emotionHistory: [],
      sessionEmotionSummary: null,
    };
    profile.emotion_sessions.push(session);
  }
  session.emotionHistory.push({
    timestamp: new Date().toISOString(),
    emotionState,
    inputMetrics: { typingMetrics, voiceMetrics, sentimentScore, grammarMistakeFrequency },
  });
  const hist = session.emotionHistory as Array<{ emotionState: EmotionState }>;
  const avg = (k: keyof EmotionState) =>
    Math.round(hist.reduce((acc, x) => acc + Number(x.emotionState[k] ?? 0), 0) / Math.max(1, hist.length));
  session.sessionEmotionSummary = {
    confidence: avg('confidence'),
    nervousness: avg('nervousness'),
    frustration: avg('frustration'),
    engagement: avg('engagement'),
    samples: hist.length,
  };

  profile.userCharacterSessions = profile.userCharacterSessions ?? [];
  let userCharacterSession = profile.userCharacterSessions.find(
    (s: any) => s.sessionId === sessionId && s.characterId === (persona?.id ?? 'emma')
  );
  if (!userCharacterSession) {
    userCharacterSession = {
      sessionId,
      characterId: persona?.id ?? 'emma',
      userId: username,
      learningProgress: { turns: 0, avgConfidence: 0 },
      sessionHistory: [],
    };
    profile.userCharacterSessions.push(userCharacterSession);
  }
  userCharacterSession.sessionHistory.push({
    at: new Date().toISOString(),
    user: message,
    tutor: reply,
  });
  userCharacterSession.learningProgress.turns = Number(userCharacterSession.learningProgress.turns ?? 0) + 1;
  userCharacterSession.learningProgress.avgConfidence = Math.round(
    ((Number(userCharacterSession.learningProgress.avgConfidence ?? 0) * (userCharacterSession.learningProgress.turns - 1)) +
      emotionState.confidence) /
      Math.max(1, userCharacterSession.learningProgress.turns)
  );

  // Update learning metrics so dashboard stats become meaningful after chat turns.
  const turnScores = computeTurnScores({
    message,
    typingMetrics,
    voiceMetrics,
    grammarMistakeFrequency,
  });
  profile.stats = profile.stats ?? {};
  profile.profile = profile.profile ?? {};
  profile.pronunciation_history = Array.isArray(profile.pronunciation_history) ? profile.pronunciation_history : [];
  profile.grammar_history = Array.isArray(profile.grammar_history) ? profile.grammar_history : [];
  profile.fluency_history = Array.isArray(profile.fluency_history) ? profile.fluency_history : [];

  profile.pronunciation_history.push({ timestamp: new Date().toISOString(), score: turnScores.pronunciation, mode: characterMode ? 'character' : 'emma' });
  profile.grammar_history.push({ timestamp: new Date().toISOString(), score: turnScores.grammar, mode: characterMode ? 'character' : 'emma' });
  profile.fluency_history.push({ timestamp: new Date().toISOString(), score: turnScores.fluency, mode: characterMode ? 'character' : 'emma' });
  profile.pronunciation_history = profile.pronunciation_history.slice(-120);
  profile.grammar_history = profile.grammar_history.slice(-120);
  profile.fluency_history = profile.fluency_history.slice(-120);

  const avgHist = (arr: any[]) => Math.round(arr.reduce((acc, x) => acc + Number(x?.score ?? 0), 0) / Math.max(1, arr.length));
  const avgPron = avgHist(profile.pronunciation_history);
  const avgGram = avgHist(profile.grammar_history);
  const avgFlu = avgHist(profile.fluency_history);
  const overall = Math.round((avgPron + avgGram + avgFlu) / 3);

  profile.stats.average_pronunciation_score = avgPron;
  profile.stats.average_grammar_score = avgGram;
  profile.stats.average_fluency_score = avgFlu;
  profile.stats.average_wpm = turnScores.wpm > 0
    ? Math.round(((Number(profile.stats.average_wpm ?? 0) * Math.max(0, Number(profile.stats.total_sessions ?? 0) - 1)) + turnScores.wpm) / Math.max(1, Number(profile.stats.total_sessions ?? 0)))
    : Number(profile.stats.average_wpm ?? 0);
  profile.stats.total_sessions = Number(profile.stats.total_sessions ?? 0) + 1;
  const typedSec = Math.max(0, Math.round(Number(typingMetrics.typingDurationMs ?? 0) / 1000));
  const spokenSec = Math.max(0, Math.round((Number(voiceMetrics.speechDurationMs ?? 0) - Number(voiceMetrics.silenceDurationMs ?? 0)) / 1000));
  profile.stats.total_practice_time = Number(profile.stats.total_practice_time ?? 0) + Math.max(1, typedSec, spokenSec);
  profile.stats.grammar_improvements = profile.grammar_history.length;
  profile.stats.pronunciation_improvements = profile.pronunciation_history.length;

  profile.profile.pronunciation_score = avgPron;
  profile.profile.grammar_score = avgGram;
  profile.profile.fluency_score = avgFlu;
  profile.profile.proficiency_score = overall;
  if (profile.profile.awaiting_initial_assessment === true) {
    profile.profile.awaiting_initial_assessment = false;
  }

  await saveProfile(username, profile);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const words = reply.split(/\s+/);
  const chunk: string[] = [];
  for (let i = 0; i < words.length; i += 6) {
    chunk.push(words.slice(i, i + 6).join(' '));
    res.write(`data: ${JSON.stringify({ text: chunk.join(' ') })}\n\n`);
  }
  res.write(
    `data: ${JSON.stringify({
      final: true,
      response: reply,
      processing_time: 0.1,
      emotionState,
      sessionId,
      activeCharacter: persona
        ? {
            id: persona.id,
            name: persona.name,
            avatar: persona.avatar,
            stylePreview: persona.stylePreview,
            ttsProfile: persona.ttsProfile,
            ambiance: persona.ambiance,
          }
        : null,
    })}\n\n`
  );
  res.end();
});

router.post('/chat/partner/end', async (req: Request, res: Response) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const userTurns = messages.filter((m: any) => m?.type === 'user').length;
  res.json({
    summary: `Nice session. You sent ${userTurns} message${userTurns === 1 ? '' : 's'} and kept the chat going.`,
    improvements: ['Ask one follow-up question each turn.', 'Keep using full sentences.'],
    message_count: userTurns,
  });
});

router.post('/chat/session-summary', async (req: Request, res: Response) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const userMessages = messages.filter((m: any) => m?.type === 'user');
  const botMessages = messages.filter((m: any) => m?.type === 'bot');
  const totalUserMsgs = userMessages.length;
  const totalWords = userMessages.reduce((acc: number, m: any) => acc + String(m?.content ?? '').trim().split(/\s+/).filter(Boolean).length, 0);
  const avgWords = totalUserMsgs ? Math.round((totalWords / totalUserMsgs) * 10) / 10 : 0;

  const achievements: string[] = [];
  if (totalUserMsgs >= 1) achievements.push('Completed an English conversation practice session');
  if (totalUserMsgs >= 5) achievements.push('Maintained an extended chat flow');
  if (totalWords >= 80) achievements.push('Used longer responses to practice fluency');
  if (achievements.length === 0) achievements.push('Started a learning session');

  const weaknesses: string[] = [];
  if (avgWords < 6 && totalUserMsgs > 0) weaknesses.push('Try writing slightly longer responses for deeper feedback');
  if (totalUserMsgs < 3) weaknesses.push('More interaction per session will improve progress tracking');
  if (weaknesses.length === 0) weaknesses.push('No major weakness detected in this short session');

  res.json({
    summary: {
      achievements,
      weaknesses,
      recommendations: [
        'Keep daily sessions short but consistent (10-15 minutes).',
        'Focus on one grammar pattern and one pronunciation target per session.',
      ],
      session_stats: {
        messages_sent: totalUserMsgs,
        bot_replies: botMessages.length,
        avg_words_per_message: avgWords,
        avg_pronunciation_score: 0,
        avg_grammar_score: 0,
        avg_fluency_score: 0,
      },
      summary_text: `You sent ${totalUserMsgs} messages this session with an average of ${avgWords} words per message. Keep going - consistency is the fastest path to improvement.`,
    },
  });
});

router.post('/chat/partner/live-analysis', async (req: Request, res: Response) => {
  const message = String(req.body?.message ?? '').trim().toLowerCase();
  const negative = /hell|damn|stupid|idiot/.test(message);
  const identity = /who are you|what are you/.test(message);
  res.json({
    summary: identity
      ? "User is asking Emma's identity."
      : 'User is practicing conversation in English.',
    tone: negative ? 'negative' : 'neutral',
    intent: identity ? 'identity challenge' : 'conversation',
    confidence: 0.82,
    strengths: ['You are actively practicing in English.'],
    improvements: ['Ask clear follow-up questions.'],
    suggested_reply: 'Can you explain how you can help me improve today?',
  });
});

router.get('/chat/emotion-summary/:sessionId', async (req: Request, res: Response) => {
  const username = (req as Request & { tutorUser?: string }).tutorUser!;
  const sessionId = String(req.params.sessionId || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const sessions = Array.isArray(profile.emotion_sessions) ? profile.emotion_sessions : [];
  const session = sessions.find((s: any) => s.sessionId === sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session emotion data not found' });
    return;
  }
  const history = Array.isArray(session.emotionHistory) ? session.emotionHistory : [];
  const progression: Array<{ timestamp: string; confidence: number; nervousness: number; frustration: number; engagement: number }> =
    history.map((h: any) => ({
      timestamp: String(h.timestamp ?? ''),
      confidence: Number(h.emotionState?.confidence ?? 0),
      nervousness: Number(h.emotionState?.nervousness ?? 0),
      frustration: Number(h.emotionState?.frustration ?? 0),
      engagement: Number(h.emotionState?.engagement ?? 0),
    }));
  const confidenceImprovement = progression.length >= 2 ? progression[progression.length - 1].confidence - progression[0].confidence : 0;
  res.json({
    sessionId,
    summary: session.sessionEmotionSummary ?? null,
    confidenceImprovement,
    weakestPatterns: {
      nervousness: Math.max(...progression.map((x) => x.nervousness), 0),
      frustration: Math.max(...progression.map((x) => x.frustration), 0),
      lowEngagement: Math.min(...progression.map((x) => x.engagement), 100),
    },
    progression,
  });
});

router.get('/pronunciation/advanced-assessment', async (_req: Request, res: Response) => {
  res.json({
    overall_score: 0,
    trend: 'Stable',
    recent_scores: [],
    improvement_areas: ['Continue practicing daily speaking.'],
    strengths: ['You are engaging with the platform.'],
    problem_sounds: [],
    mispronounced_words: [],
    recommendations: ['Try short daily speaking sessions.'],
    detailed_analysis: 'Assessment updates as more speaking data is collected.',
    sessions_analyzed: 0,
  });
});

router.get('/progress/detailed-analytics', async (_req: Request, res: Response) => {
  const username = (_req as Request & { tutorUser?: string }).tutorUser!;
  const profile = await loadProfile(username);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const pHist = Array.isArray(profile.pronunciation_history) ? profile.pronunciation_history : [];
  const gHist = Array.isArray(profile.grammar_history) ? profile.grammar_history : [];
  const fHist = Array.isArray(profile.fluency_history) ? profile.fluency_history : [];
  const convo = Array.isArray(profile.conversation_history) ? profile.conversation_history : [];
  const levelChanges = Array.isArray(profile.level_change_history) ? profile.level_change_history : [];

  const avg = (arr: any[]) =>
    arr.length ? Math.round(arr.reduce((acc, x) => acc + Number(x?.score ?? 0), 0) / arr.length) : 0;
  const velocity = (arr: any[]) => {
    if (arr.length < 2) return 0;
    const first = Number(arr[0]?.score ?? 0);
    const last = Number(arr[arr.length - 1]?.score ?? 0);
    return Math.round((last - first) * 10) / 10;
  };
  const stddev = (arr: any[]) => {
    if (arr.length < 2) return 0;
    const m = avg(arr);
    const v = arr.reduce((acc, x) => acc + (Number(x?.score ?? 0) - m) ** 2, 0) / arr.length;
    return Math.sqrt(v);
  };
  const consistencyLabel = (arr: any[]) => {
    const s = stddev(arr);
    if (s <= 6) return 'Strong';
    if (s <= 12) return 'Stable';
    return 'Variable';
  };

  const currentScores = {
    pronunciation: Number(profile.profile?.pronunciation_score ?? avg(pHist)),
    grammar: Number(profile.profile?.grammar_score ?? avg(gHist)),
    fluency: Number(profile.profile?.fluency_score ?? avg(fHist)),
  };
  const overall = Math.round((currentScores.pronunciation + currentScores.grammar + currentScores.fluency) / 3);
  const learningVelocity = {
    pronunciation: velocity(pHist),
    grammar: velocity(gHist),
    fluency: velocity(fHist),
  };
  const improvementRate = Math.round(((learningVelocity.pronunciation + learningVelocity.grammar + learningVelocity.fluency) / 3) * 10) / 10;

  const now = new Date();
  const weeklySessionCounts = [0, 0, 0, 0];
  for (const item of convo) {
    const ts = new Date(item?.timestamp ?? 0);
    if (Number.isNaN(ts.getTime())) continue;
    const diffDays = Math.floor((now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 28) {
      const bucket = Math.floor(diffDays / 7);
      weeklySessionCounts[3 - bucket] += 1;
    }
  }

  const activeDaysSet = new Set<string>();
  for (const item of convo) {
    const ts = new Date(item?.timestamp ?? 0);
    if (!Number.isNaN(ts.getTime())) activeDaysSet.add(ts.toISOString().slice(0, 10));
  }

  const problemAreas: string[] = [];
  if (currentScores.pronunciation < 65) problemAreas.push('Pronunciation clarity is below target.');
  if (currentScores.grammar < 65) problemAreas.push('Grammar accuracy needs reinforcement.');
  if (currentScores.fluency < 65) problemAreas.push('Fluency pace and continuity can improve.');
  if (problemAreas.length === 0) problemAreas.push('No major weak area detected; maintain consistency.');

  const strengths: string[] = [];
  if (currentScores.pronunciation >= 75) strengths.push('Good pronunciation quality.');
  if (currentScores.grammar >= 75) strengths.push('Strong grammar control.');
  if (currentScores.fluency >= 75) strengths.push('Smooth conversational fluency.');
  if (strengths.length === 0) strengths.push('You are actively building all core language skills.');

  const milestones: string[] = [];
  if (convo.length >= 10) milestones.push('Completed 10+ tutor turns');
  if (convo.length >= 30) milestones.push('Completed 30+ tutor turns');
  if (overall >= 70) milestones.push('Reached overall score 70+');
  if (levelChanges.length > 0) milestones.push('Performed level progression adjustment');

  const nextGoals: string[] = [];
  if (currentScores.pronunciation < 75) nextGoals.push('Do 3 pronunciation-focused turns this week.');
  if (currentScores.grammar < 75) nextGoals.push('Write 5 longer messages with correct punctuation.');
  if (currentScores.fluency < 75) nextGoals.push('Keep replies above 12 words for better flow.');
  if (nextGoals.length === 0) nextGoals.push('Complete 3 practice chats this week.');

  const summary = convo.length
    ? `Analytics based on ${convo.length} chat turns. Overall trend is ${improvementRate >= 0 ? 'improving' : 'declining'} with ${activeDaysSet.size} active day(s).`
    : 'More practice sessions are needed for detailed analytics.';

  res.json({
    current_scores: { ...currentScores, overall },
    learning_velocity: learningVelocity,
    improvement_rate: improvementRate,
    total_sessions: Number(profile.stats?.total_sessions ?? convo.length),
    days_active: activeDaysSet.size,
    level_progressions: levelChanges.length,
    weekly_session_counts: weeklySessionCounts,
    problem_areas: problemAreas,
    strengths,
    consistency_ratings: {
      pronunciation: consistencyLabel(pHist),
      grammar: consistencyLabel(gHist),
      fluency: consistencyLabel(fHist),
    },
    milestones_achieved: milestones,
    key_insights: [
      `Current overall score: ${overall}%`,
      `Average WPM: ${Number(profile.stats?.average_wpm ?? 0)}`,
    ],
    next_goals: nextGoals,
    analytics_summary: summary,
  });
});

export const tutorRouter = router;


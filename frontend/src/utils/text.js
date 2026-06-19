export const capitalizeWord = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const formatIntentLabel = (intent) =>
  capitalizeWord(String(intent || 'conversation').replace(/_/g, ' '));

export function looksLikeQuestion(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (t.includes('?')) return true;
  if (/^(what|where|why|how|who)\b/.test(t)) return true;
  if (/^(do|does|did|is|are|was|were|can|could|will|would|should|have|has|had|may|might)\b/.test(t)) return true;
  if (/\b(can you|could you|would you|do you think|is it|are there|should i)\b/.test(t)) return true;
  return false;
}

export function normalizeUserInputPunctuation(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.replace(/[.?!]+\s*$/, '').trim();
  if (!t) return '';
  if (t.length > 1) t = t.charAt(0).toUpperCase() + t.slice(1);
  return `${t}${looksLikeQuestion(t) ? '?' : '.'}`;
}

export function cleanVoiceTranscript(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(um|uh|erm|er|ah|hmm)\b/gi, ' ');
  t = t.replace(/[^\w\s'?.!,]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (t) {
    t = t.replace(/[.?!]+\s*$/, '').trim();
    t = `${t}${looksLikeQuestion(t) ? '?' : '.'}`;
  }
  if (t.length > 1) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

export function normalizeSttText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t
    .replace(/\b(i)\b/g, 'I')
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\bthats\b/gi, "that's")
    .replace(/\bwhats\b/gi, "what's")
    .replace(/\bits\b/gi, "it's");
  t = t.replace(/\b(\w+)(\s+\1){2,}\b/gi, '$1');
  t = t.replace(/\b(um|uh|erm|er|ah|hmm|like|you know)\b/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

export function tokenizeNormalized(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function splitIntoSpeechChunks(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const chunks = t
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length === 1 && chunks[0].length > 220) {
    return chunks[0]
      .split(/(?<=[,;:])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return chunks;
}

export function getWpmLabel(wpm) {
  const n = Number(wpm || 0);
  if (n < 70) return 'Slow';
  if (n < 110) return 'Moderate';
  if (n < 155) return 'Fluent';
  return 'Fast';
}

export function detectEndIntent(text) {
  const normalized = (text || '').toLowerCase().trim();
  const phraseSeeds = [
    'end chat',
    'stop talking',
    'thats enough',
    "that's enough",
    'i want to end this',
    'let us end this',
    "let's end this",
    'bye',
    'goodbye',
    'i am done',
    "i'm done",
    'stop this',
  ];

  for (const p of phraseSeeds) {
    if (normalized.includes(p)) {
      return { matched: p, confidence: 0.95 };
    }
  }

  const inputTokens = new Set(tokenizeNormalized(normalized));
  if (!inputTokens.size) return { matched: null, confidence: 0 };

  let best = 0;
  let matched = null;
  for (const phrase of phraseSeeds) {
    const phraseTokens = new Set(tokenizeNormalized(phrase));
    const overlap = [...phraseTokens].filter((t) => inputTokens.has(t)).length;
    const score = overlap / Math.max(phraseTokens.size, 1);
    if (score > best) {
      best = score;
      matched = phrase;
    }
  }

  if (inputTokens.has('bye') || inputTokens.has('goodbye')) {
    best = Math.max(best, 0.9);
  }
  return { matched, confidence: best };
}

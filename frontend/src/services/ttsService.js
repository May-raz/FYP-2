/**
 * Text-to-speech service — browser speechSynthesis today.
 *
 * TO SWAP PROVIDER LATER:
 * 1. Set TTS_PROVIDER to 'openai' or 'elevenlabs'.
 * 2. Implement speakWithOpenAi() / speakWithElevenLabs() below.
 * 3. Route speakAssistantText() through the chosen provider.
 * 4. Add API keys on the backend and expose a /api/speech/synthesize endpoint (recommended).
 */

export const TTS_PROVIDER = 'browser'; // 'browser' | 'openai' | 'elevenlabs'

/** Per-character voice tuning (rate ≈ speed, pitch ≈ 0.5–2). */
export const VOICE_PROFILES = {
  emma: {
    preferredVoiceHints: ['google', 'natural', 'neural', 'jenny', 'aria', 'samantha', 'emma', 'female'],
    avoidHints: ['male', 'david', 'mark'],
    rate: 0.96,
    pitch: 1.05,
    lang: 'en-US',
  },
  einstein: {
    preferredVoiceHints: ['google uk english male', 'daniel', 'aaron', 'arthur', 'male'],
    avoidHints: ['zira', 'jenny'],
    rate: 0.92,
    pitch: 0.94,
    lang: 'en-GB',
  },
  shakespeare: {
    preferredVoiceHints: ['google uk english male', 'daniel', 'arthur', 'ryan', 'uk'],
    avoidHints: ['zira'],
    rate: 0.88,
    pitch: 1.02,
    lang: 'en-GB',
  },
  sherlock: {
    preferredVoiceHints: ['google uk english male', 'arthur', 'david', 'daniel'],
    avoidHints: ['samantha'],
    rate: 0.94,
    pitch: 0.9,
    lang: 'en-GB',
  },
  napoleon: {
    preferredVoiceHints: ['david', 'mark', 'george', 'microsoft', 'male'],
    avoidHints: ['samantha', 'jenny', 'zira'],
    rate: 1.0,
    pitch: 0.88,
    lang: 'en-GB',
  },
  mariecurie: {
    preferredVoiceHints: ['jenny', 'aria', 'samantha', 'google', 'female'],
    avoidHints: ['david', 'mark'],
    rate: 0.9,
    pitch: 1.04,
    lang: 'en-US',
  },
  tesla: {
    preferredVoiceHints: ['aaron', 'guy', 'ryan', 'google us english'],
    avoidHints: ['zira', 'samantha'],
    rate: 0.98,
    pitch: 0.92,
    lang: 'en-US',
  },
  abrahamlincoln: {
    preferredVoiceHints: ['davis', 'guy', 'mark', 'microsoft', 'male'],
    avoidHints: ['jenny', 'aria'],
    rate: 0.88,
    pitch: 0.86,
    lang: 'en-US',
  },
  cleopatra: {
    preferredVoiceHints: ['aria', 'jenny', 'zira', 'samantha', 'female'],
    avoidHints: ['aaron', 'guy', 'david'],
    rate: 0.94,
    pitch: 1.08,
    lang: 'en-GB',
  },
  elonmusk: {
    preferredVoiceHints: ['guy', 'ryan', 'davis', 'google us english'],
    avoidHints: ['google uk english'],
    rate: 1.06,
    pitch: 0.96,
    lang: 'en-US',
  },
  challenge: {
    preferredVoiceHints: ['google', 'natural', 'neural', 'guy', 'david'],
    avoidHints: [],
    rate: 1.1,
    pitch: 0.98,
    lang: 'en-US',
  },
};

function scoreVoice(voice, profile) {
  const name = String(voice?.name || '').toLowerCase();
  const lang = String(voice?.lang || '').toLowerCase();
  let score = lang.startsWith('en') ? 25 : 0;

  if (profile.lang && lang.includes(profile.lang.toLowerCase().slice(0, 5))) score += 20;

  (profile.preferredVoiceHints || []).forEach((hint, idx) => {
    if (name.includes(String(hint).toLowerCase())) score += 90 - idx * 8;
  });
  (profile.avoidHints || []).forEach((hint) => {
    if (name.includes(String(hint).toLowerCase())) score -= 50;
  });

  if (name.includes('google')) score += 40;
  if (name.includes('natural') || name.includes('neural')) score += 45;
  if (name.includes('premium') || name.includes('enhanced')) score += 30;
  if (name.includes('online')) score += 25;
  if (name.includes('local')) score -= 15;

  return score;
}

export function getVoiceProfile(characterId, challengeMode = false, serverProfile = null) {
  const id = String(characterId || 'emma').toLowerCase();
  const base = VOICE_PROFILES[id] || VOICE_PROFILES.emma;
  if (challengeMode) {
    return {
      ...base,
      rate: Math.min(1.15, (base.rate + VOICE_PROFILES.challenge.rate) / 2),
      pitch: VOICE_PROFILES.challenge.pitch,
      preferredVoiceHints: [...(base.preferredVoiceHints || []), ...(VOICE_PROFILES.challenge.preferredVoiceHints || [])],
    };
  }
  if (serverProfile) {
    return {
      ...base,
      preferredVoiceHints: [
        ...(Array.isArray(serverProfile.preferredVoiceHints) ? serverProfile.preferredVoiceHints : []),
        ...(base.preferredVoiceHints || []),
      ],
      rate: Number(serverProfile.rate) > 0 ? Number(serverProfile.rate) : base.rate,
      pitch: Number(serverProfile.pitch) > 0 ? Number(serverProfile.pitch) : base.pitch,
    };
  }
  return base;
}

export function pickVoiceForProfile(profile) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices?.length) return null;
  const en = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith('en'));
  const pool = en.length ? en : voices;
  return [...pool].sort((a, b) => scoreVoice(b, profile) - scoreVoice(a, profile))[0] || null;
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

/**
 * Speak assistant reply. Only pass conversational reply text — not corrections.
 */
export function speakAssistantText(text, options = {}) {
  const {
    audioEnabled = true,
    voice = null,
    profile = VOICE_PROFILES.emma,
    onDone,
    onError,
    generationRef,
  } = options;

  if (!audioEnabled || typeof window === 'undefined' || !window.speechSynthesis) return () => {};

  if (TTS_PROVIDER !== 'browser') {
    // Future: return speakWithOpenAi(text, options) or speakWithElevenLabs(text, options)
    console.info(`[tts] Provider "${TTS_PROVIDER}" not wired yet — using browser fallback.`);
  }

  let cancelled = false;
  const generation = (generationRef?.current ?? 0) + 1;
  if (generationRef) generationRef.current = generation;

  try {
    window.speechSynthesis.cancel();
    const chunks = splitIntoSpeechChunks(text);
    const queue = [...chunks];

    const speakNext = () => {
      if (cancelled || (generationRef && generationRef.current !== generation)) return;
      const next = queue.shift();
      if (!next) {
        onDone?.();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(next);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || profile.lang || 'en-US';
      } else {
        utterance.lang = profile.lang || 'en-US';
      }
      utterance.rate = Number(profile.rate) > 0 ? profile.rate : 0.96;
      const basePitch = Number(profile.pitch) > 0 ? profile.pitch : 1.02;
      utterance.pitch = next.trim().endsWith('?') ? Math.min(1.2, basePitch + 0.04) : basePitch;
      utterance.volume = 1;
      utterance.onend = () => setTimeout(speakNext, 110);
      utterance.onerror = (e) => {
        const code = String(e?.error || '').toLowerCase();
        if (code !== 'interrupted' && code !== 'canceled' && code !== 'cancelled') {
          onError?.(e);
        }
        setTimeout(speakNext, 40);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  } catch (err) {
    onError?.(err);
  }

  return () => {
    cancelled = true;
    try {
      window.speechSynthesis?.cancel();
    } catch (_) {
      /* ignore */
    }
  };
}

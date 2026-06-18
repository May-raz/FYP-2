/**
 * SpeakWise TTS — ElevenLabs only (no browser speechSynthesis).
 *
 * Audio flow:
 *   Frontend → POST /api/speech/synthesize → ElevenLabs → audio/mpeg → HTMLAudioElement
 *
 * TO CHANGE PROVIDER LATER: replace fetch target in requestSpeechAudio().
 */

let activeAudio = null;
let activeObjectUrl = null;
let activeAbort = null;
let speakGeneration = 0;

export function stopAssistantSpeech() {
  speakGeneration += 1;
  if (activeAbort) {
    try {
      activeAbort.abort();
    } catch (_) {
      /* ignore */
    }
    activeAbort = null;
  }
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch (_) {
      /* ignore */
    }
    activeAudio = null;
  }
  if (activeObjectUrl) {
    try {
      URL.revokeObjectURL(activeObjectUrl);
    } catch (_) {
      /* ignore */
    }
    activeObjectUrl = null;
  }
}

async function requestSpeechAudio({
  text,
  apiBaseUrl,
  authHeaders,
  characterId,
  challengeMode,
  slow,
  signal,
}) {
  const base = String(apiBaseUrl || '').replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    ...(typeof authHeaders === 'function' ? authHeaders() : authHeaders || {}),
  };
  const response = await fetch(`${base}/api/speech/synthesize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: String(text || '').trim(),
      characterId: characterId || 'emma',
      challengeMode: Boolean(challengeMode),
      slow: Boolean(slow),
    }),
    signal,
  });
  if (!response.ok) {
    let detail = '';
    try {
      const json = await response.json();
      detail = json?.error ? `: ${json.error}` : '';
    } catch (_) {
      detail = '';
    }
    throw new Error(`Voice service temporarily unavailable.${detail ? ` (${detail.replace(/^: /, '')})` : ''}`);
  }
  return response.blob();
}

/**
 * Speak assistant reply via ElevenLabs. Only pass conversational text.
 * Stops any previous audio automatically.
 */
export async function speakAssistantText(text, options = {}) {
  const {
    audioEnabled = true,
    apiBaseUrl = '',
    authHeaders = {},
    characterId = 'emma',
    challengeMode = false,
    slow = false,
    generationRef,
    onDone,
    onError,
  } = options;

  const content = String(text || '').trim();
  if (!audioEnabled || !content) return;

  stopAssistantSpeech();
  const generation = speakGeneration;
  if (generationRef) generationRef.current = generation;

  activeAbort = new AbortController();

  try {
    const blob = await requestSpeechAudio({
      text: content,
      apiBaseUrl,
      authHeaders,
      characterId,
      challengeMode,
      slow,
      signal: activeAbort.signal,
    });

    if (generation !== speakGeneration) return;

    const url = URL.createObjectURL(blob);
    activeObjectUrl = url;
    const audio = new Audio(url);
    activeAudio = audio;

    audio.onended = () => {
      if (generation !== speakGeneration) return;
      stopAssistantSpeech();
      onDone?.();
    };
    audio.onerror = () => {
      if (generation !== speakGeneration) return;
      const err = new Error('Audio playback failed');
      onError?.(err);
      stopAssistantSpeech();
    };

    await audio.play();
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('[tts] ElevenLabs playback error:', err);
    onError?.(err);
    stopAssistantSpeech();
  }
}

/** @deprecated kept for imports — use speakAssistantText */
export function getVoiceProfile() {
  return { provider: 'elevenlabs' };
}

/** @deprecated no-op — browser voices removed */
export function pickVoiceForProfile() {
  return null;
}

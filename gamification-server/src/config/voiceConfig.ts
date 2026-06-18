/**
 * ElevenLabs voice IDs per SpeakWise character.
 *
 * HOW TO CUSTOMIZE:
 * 1. Go to https://elevenlabs.io/app/voice-library
 * 2. Pick a voice → copy its Voice ID
 * 3. Set env var ELEVENLABS_VOICE_EMMA=your_id (etc.) OR edit defaults below
 *
 * Free-tier note: some library voices (e.g. Rachel) require a paid plan via API.
 * Defaults below use voices verified on the ElevenLabs free API tier.
 *
 * Verified free-tier voice IDs:
 * - Bella (EXAVITQu4vr4xnSDxMaL), Adam, George, Antoni, Liam, Arnold
 */

export type VoiceCharacterKey =
  | 'emma'
  | 'einstein'
  | 'shakespeare'
  | 'sherlock'
  | 'napoleon'
  | 'mariecurie'
  | 'tesla'
  | 'abrahamlincoln'
  | 'cleopatra'
  | 'elonmusk'
  | 'challenge';

export interface VoiceProfileConfig {
  /** ElevenLabs voice_id */
  voiceId: string;
  /** Human-readable label for docs / debugging */
  label: string;
  /** ElevenLabs model — eleven_flash_v2_5 is fast + good for demos */
  modelId: string;
  stability: number;
  similarityBoost: number;
  /** Optional speaking style exaggeration (0–1) */
  style: number;
  /** Suggested voice name in ElevenLabs library */
  recommendedLibraryVoice: string;
}

const DEFAULT_MODEL = 'eleven_flash_v2_5';

function voiceFromEnv(envKey: string, fallback: string): string {
  const v = String(process.env[envKey] ?? '').trim();
  return v || fallback;
}

/** Premade ElevenLabs voice IDs — replace via env vars without code changes */
export const VOICE_CONFIG: Record<VoiceCharacterKey, VoiceProfileConfig> = {
  emma: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_EMMA', 'EXAVITQu4vr4xnSDxMaL'),
    label: 'Emma',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.42,
    similarityBoost: 0.78,
    style: 0.35,
    recommendedLibraryVoice: 'Bella',
  },
  einstein: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_EINSTEIN', 'ErXwobaYiN019PkySvjV'),
    label: 'Albert Einstein',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.25,
    recommendedLibraryVoice: 'Antoni',
  },
  shakespeare: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_SHAKESPEARE', 'JBFqnCBsd6RMkjVDRZzb'),
    label: 'William Shakespeare',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.45,
    similarityBoost: 0.8,
    style: 0.4,
    recommendedLibraryVoice: 'George',
  },
  sherlock: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_SHERLOCK', 'JBFqnCBsd6RMkjVDRZzb'),
    label: 'Sherlock Holmes',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.55,
    similarityBoost: 0.72,
    style: 0.2,
    recommendedLibraryVoice: 'George',
  },
  napoleon: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_NAPOLEON', 'pNInz6obpgDQGcFmaJgB'),
    label: 'Napoleon',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.6,
    similarityBoost: 0.7,
    style: 0.45,
    recommendedLibraryVoice: 'Adam',
  },
  mariecurie: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_MARIE_CURIE', 'EXAVITQu4vr4xnSDxMaL'),
    label: 'Marie Curie',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.52,
    similarityBoost: 0.76,
    style: 0.15,
    recommendedLibraryVoice: 'Bella',
  },
  tesla: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_TESLA', 'TX3LPaxmHKxFdv7VOQHJ'),
    label: 'Nikola Tesla',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.48,
    similarityBoost: 0.74,
    style: 0.3,
    recommendedLibraryVoice: 'Liam',
  },
  abrahamlincoln: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_LINCOLN', 'pNInz6obpgDQGcFmaJgB'),
    label: 'Abraham Lincoln',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.58,
    similarityBoost: 0.7,
    style: 0.1,
    recommendedLibraryVoice: 'Adam',
  },
  cleopatra: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_CLEOPATRA', 'EXAVITQu4vr4xnSDxMaL'),
    label: 'Cleopatra',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.44,
    similarityBoost: 0.8,
    style: 0.42,
    recommendedLibraryVoice: 'Bella',
  },
  elonmusk: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_ELON', 'TX3LPaxmHKxFdv7VOQHJ'),
    label: 'Elon Musk',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.4,
    similarityBoost: 0.72,
    style: 0.38,
    recommendedLibraryVoice: 'Liam',
  },
  challenge: {
    voiceId: voiceFromEnv('ELEVENLABS_VOICE_CHALLENGE', 'VR6AewLTigWG4xSOukaG'),
    label: 'Challenge Mode',
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
    stability: 0.65,
    similarityBoost: 0.68,
    style: 0.5,
    recommendedLibraryVoice: 'Arnold',
  },
};

const CHARACTER_TO_VOICE_KEY: Record<string, VoiceCharacterKey> = {
  emma: 'emma',
  einstein: 'einstein',
  shakespeare: 'shakespeare',
  sherlock: 'sherlock',
  napoleon: 'napoleon',
  mariecurie: 'mariecurie',
  tesla: 'tesla',
  abrahamlincoln: 'abrahamlincoln',
  cleopatra: 'cleopatra',
  elonmusk: 'elonmusk',
};

export function resolveVoiceKey(characterId?: string | null, challengeMode = false): VoiceCharacterKey {
  if (challengeMode) return 'challenge';
  const id = String(characterId ?? 'emma').trim().toLowerCase();
  return CHARACTER_TO_VOICE_KEY[id] ?? 'emma';
}

export function getVoiceProfile(characterId?: string | null, challengeMode = false): VoiceProfileConfig {
  return VOICE_CONFIG[resolveVoiceKey(characterId, challengeMode)];
}

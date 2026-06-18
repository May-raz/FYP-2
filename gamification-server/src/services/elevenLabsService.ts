import { getVoiceProfile, type VoiceCharacterKey, resolveVoiceKey } from '../config/voiceConfig';

export interface SynthesizeSpeechArgs {
  text: string;
  characterId?: string | null;
  challengeMode?: boolean;
  slow?: boolean;
}

export interface SynthesizeSpeechResult {
  audio: Buffer;
  contentType: string;
  voiceKey: VoiceCharacterKey;
  voiceId: string;
}

function getApiKey(): string {
  const key = String(process.env.ELEVENLABS_API_KEY ?? '').trim();
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }
  return key;
}

/**
 * Calls ElevenLabs Text-to-Speech REST API.
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export async function synthesizeSpeechWithElevenLabs(
  args: SynthesizeSpeechArgs
): Promise<SynthesizeSpeechResult> {
  const text = String(args.text ?? '').trim();
  if (!text) {
    throw new Error('Text is required for speech synthesis');
  }
  if (text.length > 2500) {
    throw new Error('Text too long for TTS (max 2500 characters)');
  }

  const voiceKey = resolveVoiceKey(args.characterId, Boolean(args.challengeMode));
  const profile = getVoiceProfile(args.characterId, Boolean(args.challengeMode));
  const apiKey = getApiKey();

  const stability = args.slow
    ? Math.min(0.85, profile.stability + 0.15)
    : profile.stability;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(profile.voiceId)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: profile.modelId,
        voice_settings: {
          stability,
          similarity_boost: profile.similarityBoost,
          style: profile.style,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);
  if (!audio.length) {
    throw new Error('ElevenLabs returned empty audio');
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  return {
    audio,
    contentType,
    voiceKey,
    voiceId: profile.voiceId,
  };
}

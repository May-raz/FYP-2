const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name: string, fallback?: string): string {
  const value = String(process.env[name] ?? fallback ?? '').trim();
  if (!value) {
    if (isProduction) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return '';
  }
  return value;
}

export function getJwtSecret(): string {
  const secret = String(process.env.JWT_SECRET_KEY ?? process.env.JWT_SECRET ?? '').trim();
  if (!secret) {
    if (isProduction) {
      throw new Error('JWT_SECRET_KEY must be set in production');
    }
    return 'dev-only-jwt-secret-change-me';
  }
  if (isProduction && secret.length < 32) {
    throw new Error('JWT_SECRET_KEY must be at least 32 characters in production');
  }
  return secret;
}

export function getDemoSeedSecret(): string | null {
  const secret = String(process.env.DEMO_SEED_SECRET ?? '').trim();
  if (!secret) return isProduction ? null : 'dev-demo-seed';
  return secret;
}

export function getMongoUri(): string {
  return requireEnv('MONGO_URI');
}

export function getOpenAiApiKey(): string {
  return String(process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? '').trim();
}

export function getElevenLabsApiKey(): string {
  return String(process.env.ELEVENLABS_API_KEY ?? '').trim();
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey().length > 0;
}

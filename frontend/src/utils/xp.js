export const XP_THRESHOLDS = [0, 200, 500, 1000, 1800, 3000, 4500, 6500, 9000, 12000];

export function clampLevel(level) {
  const n = Number(level || 1);
  return Math.max(1, Math.min(10, Number.isFinite(n) ? Math.floor(n) : 1));
}

export function getLevelFromXp(xp) {
  const safeXp = Math.max(0, Number(xp || 0));
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (safeXp >= XP_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function computeCompositeProgress(profile) {
  const xp = profile?.xp || {};
  const fluencyXp = Math.max(0, Number(xp.fluency ?? 0));
  const grammarXp = Math.max(0, Number(xp.grammar ?? 0));
  const eqXp = Math.max(0, Number(xp.eq ?? 0));
  const compositeXp = Math.round((fluencyXp + grammarXp + eqXp) / 3);
  const explicitLevel = clampLevel(profile?.levels?.composite ?? 1);
  const inferredLevel = getLevelFromXp(compositeXp);
  const compositeLevel = Math.max(explicitLevel, inferredLevel);
  const atMaxLevel = compositeLevel >= 10;
  const nextLevel = atMaxLevel ? 10 : compositeLevel + 1;
  const currentThreshold = XP_THRESHOLDS[compositeLevel - 1] ?? 0;
  const nextThreshold = XP_THRESHOLDS[nextLevel - 1] ?? XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
  const xpIntoLevel = Math.max(0, compositeXp - currentThreshold);
  const xpSpan = Math.max(1, nextThreshold - currentThreshold);
  const xpToNext = atMaxLevel ? 0 : Math.max(0, nextThreshold - compositeXp);
  const progressPct = atMaxLevel ? 100 : Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpSpan) * 100)));
  return {
    fluencyXp,
    grammarXp,
    eqXp,
    compositeXp,
    compositeLevel,
    nextLevel,
    currentThreshold,
    nextThreshold,
    xpIntoLevel,
    xpSpan,
    xpToNext,
    progressPct,
    atMaxLevel,
  };
}

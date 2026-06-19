export function inferMessageEmotion(text) {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return 'neutral';
  const angry = /\b(hate|angry|furious|annoyed|frustrated|ugh|worst|terrible|awful|rage|mad at)\b/;
  const sad = /\b(sad|depressed|lonely|cry|crying|tears|miss you|hurts|hopeless|down|miserable)\b/;
  const happy = /\b(happy|great|awesome|love it|excited|celebrate|yay|wonderful|amazing|joy|glad|lol)\b/;
  if (angry.test(t)) return 'angry';
  if (sad.test(t)) return 'sad';
  if (happy.test(t)) return 'happy';
  return 'neutral';
}

export function buildEmotionTrend(messages) {
  const counts = { happy: 0, sad: 0, angry: 0, neutral: 0 };
  for (const m of messages || []) {
    if (m.type !== 'user') continue;
    const e = m.emotion || inferMessageEmotion(m.content);
    if (Object.prototype.hasOwnProperty.call(counts, e)) counts[e] += 1;
    else counts.neutral += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return ['happy', 'sad', 'angry', 'neutral'].map((label) => ({
    label,
    count: counts[label],
    pct: Math.round((100 * counts[label]) / total),
  }));
}

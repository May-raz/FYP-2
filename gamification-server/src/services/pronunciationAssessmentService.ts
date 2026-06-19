export interface PronunciationAssessment {
  score: number;
  fluency: number;
  accuracy: number;
  problemWords: string[];
  missingWords: string[];
  suggestedPractice: string[];
  tips: string[];
  correctedPhrase: string;
  encouragingFeedback: string;
}

export interface PracticePhraseItem {
  text: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category:
    | 'daily conversation'
    | 'academic English'
    | 'interview English'
    | 'difficult consonants'
    | 'vowel sounds'
    | 'connected speech'
    | 'stress and intonation';
  focusSound: string;
  breakdown: string;
  tip: string;
}

export const PRACTICE_PHRASE_CATALOG: PracticePhraseItem[] = [
  { text: 'I feel comfortable speaking English.', difficulty: 'beginner', category: 'daily conversation', focusSound: 'comfortable', breakdown: 'KUHM-fuh-tuh-bul', tip: 'Stress the first syllable; do not say "comfort table".' },
  { text: 'The weather is beautiful today.', difficulty: 'beginner', category: 'daily conversation', focusSound: 'beautiful', breakdown: 'BYOO-tih-fuhl', tip: 'Link "is" lightly into "beautiful".' },
  { text: 'Could you please repeat the question?', difficulty: 'beginner', category: 'daily conversation', focusSound: 'repeat', breakdown: 'rih-PEET', tip: 'Stress the second syllable in "repeat".' },
  { text: 'I would like to improve my pronunciation.', difficulty: 'intermediate', category: 'daily conversation', focusSound: 'pronunciation', breakdown: 'pruh-nun-see-AY-shun', tip: 'Stress -NUN- in the middle.' },
  { text: 'I usually go to university in the morning.', difficulty: 'beginner', category: 'daily conversation', focusSound: 'university', breakdown: 'yoo-nuh-VUR-sih-tee', tip: 'Stress the third syllable: -VER-.' },
  { text: 'Let me think about that for a moment.', difficulty: 'beginner', category: 'daily conversation', focusSound: 'moment', breakdown: 'MOH-muhnt', tip: 'Keep the final "t" light but clear.' },
  { text: 'The development of AI tools is fascinating.', difficulty: 'advanced', category: 'academic English', focusSound: 'development', breakdown: 'dih-VEL-uhp-muhnt', tip: 'Stress -VEL-; avoid saying "devel-op-ment" evenly.' },
  { text: 'Entrepreneurship requires patience and confidence.', difficulty: 'advanced', category: 'academic English', focusSound: 'entrepreneurship', breakdown: 'ahn-truh-pruh-NUR-ship', tip: 'Break into four clear parts; stress -NUR-.' },
  { text: 'The theory was thoroughly explained in class.', difficulty: 'advanced', category: 'academic English', focusSound: 'thoroughly', breakdown: 'THUR-oh-lee', tip: 'Start with voiceless "th" as in "think".' },
  { text: 'Researchers analyze data with careful precision.', difficulty: 'advanced', category: 'academic English', focusSound: 'analyze', breakdown: 'AN-uh-lyz', tip: 'Stress the first syllable AN-.' },
  { text: 'I am passionate about sustainable technology.', difficulty: 'intermediate', category: 'academic English', focusSound: 'sustainable', breakdown: 'suh-STAY-nuh-buhl', tip: 'Stress STAY; keep the final syllable soft.' },
  { text: 'Tell me about a challenge you overcame at work.', difficulty: 'intermediate', category: 'interview English', focusSound: 'challenge', breakdown: 'CHAL-inj', tip: 'Stress CHAL-; soft final "ge".' },
  { text: 'I work well under pressure in team projects.', difficulty: 'intermediate', category: 'interview English', focusSound: 'pressure', breakdown: 'PRESH-er', tip: 'Link "work well" smoothly without pausing.' },
  { text: 'My greatest strength is clear communication.', difficulty: 'intermediate', category: 'interview English', focusSound: 'communication', breakdown: 'kuh-myoo-nih-KAY-shun', tip: 'Stress -KAY- near the end.' },
  { text: 'I am excited to contribute to your company.', difficulty: 'intermediate', category: 'interview English', focusSound: 'contribute', breakdown: 'kun-TRIB-yoot', tip: 'Stress TRIB; round the final vowel.' },
  { text: 'She sells seashells by the seashore.', difficulty: 'advanced', category: 'difficult consonants', focusSound: 's / sh contrast', breakdown: 'sellz · SEE-shellz · SEE-shore', tip: 'Keep /s/ and /sh/ clearly different.' },
  { text: 'The rural road was really rough.', difficulty: 'advanced', category: 'difficult consonants', focusSound: 'r', breakdown: 'RUR-uhl · rohd · RUHF', tip: 'Curl the tongue lightly for each /r/.' },
  { text: 'A large orange bridge crossed the river.', difficulty: 'intermediate', category: 'difficult consonants', focusSound: 'r + l', breakdown: 'larj · OR-inj · brij', tip: 'Do not drop the /r/ in "large" and "river".' },
  { text: 'The thoughtful student studied statistics.', difficulty: 'advanced', category: 'difficult consonants', focusSound: 'th / st', breakdown: 'THAWT-fuhl · STUH-dis-tiks', tip: 'Voiceless "th" at the start; crisp /st/ clusters.' },
  { text: 'Victor visited Vancouver in November.', difficulty: 'advanced', category: 'difficult consonants', focusSound: 'v', breakdown: 'VIK-ter · van-KOO-ver', tip: 'Touch the lip gently for /v/; do not use /w/.' },
  { text: 'I thought the theory was thoroughly explained.', difficulty: 'advanced', category: 'vowel sounds', focusSound: 'aw / er', breakdown: 'thawt · THEER-ee · THUR-oh-lee', tip: 'Keep "thought" and "thoroughly" vowels distinct.' },
  { text: 'The bird heard the early morning chorus.', difficulty: 'intermediate', category: 'vowel sounds', focusSound: 'ur / ear', breakdown: 'burd · hurd · UR-lee', tip: 'Round lips slightly for /ur/ sounds.' },
  { text: 'Please sit near the clear window seat.', difficulty: 'beginner', category: 'vowel sounds', focusSound: 'ee / ea', breakdown: 'pleez · neer · kleer', tip: 'Long "ee" is steady; do not slide into "ay".' },
  { text: 'I want to talk about world culture.', difficulty: 'beginner', category: 'connected speech', focusSound: 'linking', breakdown: 'wanna · talk_about · world_culture', tip: 'Link words in thought groups, not word by word.' },
  { text: 'Kind of like a lot of practice every day.', difficulty: 'intermediate', category: 'connected speech', focusSound: 'reductions', breakdown: 'kinda · like_a · lotta', tip: 'Use natural reductions in casual speech.' },
  { text: 'Did you get a chance to look at it?', difficulty: 'intermediate', category: 'connected speech', focusSound: 'did you / get a', breakdown: 'dijoo · get_a · chance_tuh', tip: '"Did you" often sounds like "dijoo".' },
  { text: 'I am going to meet them after lunch.', difficulty: 'beginner', category: 'connected speech', focusSound: 'gonna', breakdown: 'am_gonna · meet_them · after_lunch', tip: 'Connect "going to" as "gonna" in fast speech.' },
  { text: 'Learning English takes patience and practice.', difficulty: 'intermediate', category: 'stress and intonation', focusSound: 'sentence stress', breakdown: 'LEARN-ing · ENG-lish · PAY-tience', tip: 'Stress content words; reduce function words.' },
  { text: 'Pronunciation is important for clear communication.', difficulty: 'intermediate', category: 'stress and intonation', focusSound: 'intonation', breakdown: 'pro-nun-see-AY-shun · im-POR-tant', tip: 'Fall your pitch at the end of statements.' },
  { text: 'Yesterday I practiced speaking with my tutor.', difficulty: 'beginner', category: 'daily conversation', focusSound: 'yesterday', breakdown: 'YES-ter-day', tip: 'Stress YES-; keep day light.' },
  { text: 'Could you please speak a little more slowly?', difficulty: 'beginner', category: 'daily conversation', focusSound: 'slowly', breakdown: 'SLOH-lee', tip: 'Stretch the vowel in "slow" slightly.' },
  { text: 'My goal is to communicate clearly and confidently.', difficulty: 'intermediate', category: 'interview English', focusSound: 'confidently', breakdown: 'KON-fih-dent-lee', tip: 'Stress KON- and -DEN-.' },
  { text: 'Reading aloud helps me improve my pronunciation.', difficulty: 'intermediate', category: 'academic English', focusSound: 'aloud', breakdown: 'uh-LAWD', tip: 'Stress the second syllable -LAWD.' },
  { text: 'World leaders discussed global climate policy.', difficulty: 'advanced', category: 'academic English', focusSound: 'global', breakdown: 'GLOH-buhl', tip: 'Stress GLOH-; keep the final /l/ light.' },
  { text: 'The sixth sick sheikh\'s sheep slept peacefully.', difficulty: 'advanced', category: 'difficult consonants', focusSound: 's / sh / th', breakdown: 'siksth · sheekhs · sheep', tip: 'Go slowly; clarity beats speed.' },
  { text: 'I need to work on my intonation and stress patterns.', difficulty: 'advanced', category: 'stress and intonation', focusSound: 'intonation', breakdown: 'in-toh-NAY-shun · STRESS', tip: 'Vary pitch on key words; avoid monotone.' },
  { text: 'I look forward to visiting London someday.', difficulty: 'intermediate', category: 'daily conversation', focusSound: 'forward', breakdown: 'FOR-werd', tip: 'Stress FOR-; link "look forward to".' },
];

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function similarityScore(target: string, transcript: string): number {
  const t = tokenize(target);
  const r = tokenize(transcript);
  if (!t.length) return 0;
  const matched = t.filter((w) => r.includes(w)).length;
  return Math.round((100 * matched) / t.length);
}

function findProblemWords(target: string, transcript: string): { problemWords: string[]; missingWords: string[] } {
  const t = tokenize(target);
  const r = tokenize(transcript);
  const missingWords = t.filter((w) => !r.includes(w));
  const problemWords: string[] = [];
  for (let i = 0; i < t.length; i += 1) {
    const expected = t[i];
    const got = r[i];
    if (!got) continue;
    if (got !== expected && !missingWords.includes(expected)) {
      problemWords.push(expected);
    }
  }
  return { problemWords: [...new Set(problemWords)], missingWords: [...new Set(missingWords)] };
}

async function llmPronunciationTips(args: {
  target: string;
  transcript: string;
  problemWords: string[];
}): Promise<Partial<PronunciationAssessment> | null> {
  const apiKey = String(process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const model = String(process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Return JSON pronunciation feedback for an English learner:
{ score, fluency, accuracy, problemWords, missingWords, suggestedPractice, tips, correctedPhrase, encouragingFeedback }
Scores are 0-100. Keep tips short and practical.`,
          },
          { role: 'user', content: JSON.stringify(args) },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = String(json?.choices?.[0]?.message?.content ?? '').trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function pickPracticePhrase(excludeText?: string): PracticePhraseItem {
  const exclude = String(excludeText ?? '').trim().toLowerCase();
  const pool = exclude
    ? PRACTICE_PHRASE_CATALOG.filter((p) => p.text.toLowerCase() !== exclude)
    : PRACTICE_PHRASE_CATALOG;
  const source = pool.length > 0 ? pool : PRACTICE_PHRASE_CATALOG;
  return source[Math.floor(Math.random() * source.length)];
}

export function findPracticePhraseByText(text: string): PracticePhraseItem | null {
  const needle = String(text || '').trim().toLowerCase();
  return PRACTICE_PHRASE_CATALOG.find((p) => p.text.toLowerCase() === needle) ?? null;
}

export function listPracticePhrases(): PracticePhraseItem[] {
  return [...PRACTICE_PHRASE_CATALOG];
}

export async function assessPronunciation(target: string, transcript: string): Promise<PronunciationAssessment> {
  const cleanTarget = String(target || '').trim();
  const cleanTranscript = String(transcript || '').trim();
  const phraseMeta = findPracticePhraseByText(cleanTarget);
  const accuracy = similarityScore(cleanTarget, cleanTranscript);
  const { problemWords, missingWords } = findProblemWords(cleanTarget, cleanTranscript);
  const fluency = Math.max(0, Math.min(100, accuracy - missingWords.length * 8 + (cleanTranscript.split(/\s+/).length >= 3 ? 5 : 0)));
  const score = Math.round(accuracy * 0.65 + fluency * 0.35);

  const heuristic: PronunciationAssessment = {
    score,
    fluency,
    accuracy,
    problemWords,
    missingWords,
    suggestedPractice: [
      ...problemWords.slice(0, 3).map((w) => `${w}, ${w}, ${w}`),
      cleanTarget,
    ].filter(Boolean),
    tips: phraseMeta
      ? [phraseMeta.tip, `Breakdown: ${phraseMeta.breakdown}`]
      : problemWords.length
        ? problemWords.map((w) => `Focus on "${w}" — say it slowly, then in the full sentence.`)
        : ['Good clarity. Try speaking a little more smoothly without long pauses.'],
    correctedPhrase: cleanTarget,
    encouragingFeedback:
      score >= 80
        ? 'Nice work — your pronunciation is clear enough for conversation.'
        : score >= 60
          ? 'Good effort. A few words need polish, but you are understandable.'
          : 'Keep practicing — focus on one problem word at a time.',
  };

  const llm = await llmPronunciationTips({ target: cleanTarget, transcript: cleanTranscript, problemWords });
  if (!llm) return heuristic;

  return {
    score: Number(llm.score ?? heuristic.score),
    fluency: Number(llm.fluency ?? heuristic.fluency),
    accuracy: Number(llm.accuracy ?? heuristic.accuracy),
    problemWords: Array.isArray(llm.problemWords) ? llm.problemWords.map(String) : heuristic.problemWords,
    missingWords: Array.isArray(llm.missingWords) ? llm.missingWords.map(String) : heuristic.missingWords,
    suggestedPractice: Array.isArray(llm.suggestedPractice) ? llm.suggestedPractice.map(String) : heuristic.suggestedPractice,
    tips: Array.isArray(llm.tips) ? llm.tips.map(String) : heuristic.tips,
    correctedPhrase: String(llm.correctedPhrase ?? heuristic.correctedPhrase),
    encouragingFeedback: String(llm.encouragingFeedback ?? heuristic.encouragingFeedback),
  };
}

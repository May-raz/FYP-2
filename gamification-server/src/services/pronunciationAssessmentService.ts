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

const PRACTICE_PHRASES = [
  'I feel comfortable speaking English.',
  'Could you please repeat that more slowly?',
  'I would like to improve my pronunciation.',
  'Learning English takes patience and practice.',
  'Yesterday I practiced speaking with my tutor.',
  'Pronunciation is important for clear communication.',
  'I enjoy discussing interesting topics in English.',
  'Let me think about that for a moment.',
  'The weather is beautiful today, isn\'t it?',
  'I am preparing for my final year presentation.',
  'Technology is changing the way we learn languages.',
  'Could you help me pronounce this word correctly?',
  'I want to sound more natural when I speak.',
  'Practice makes perfect, especially with difficult sounds.',
  'She speaks English fluently after years of practice.',
  'Reading aloud helps me improve my pronunciation.',
  'I sometimes feel nervous before speaking in class.',
  'Listening to podcasts helps me learn new expressions.',
  'The development of AI tools is fascinating.',
  'I look forward to visiting London someday.',
  'Pronouncing "comfortable" correctly is still challenging.',
  'My goal is to communicate clearly and confidently.',
  'Would you like to practice a short conversation?',
  'I need to work on my intonation and stress patterns.',
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
          {
            role: 'user',
            content: JSON.stringify(args),
          },
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

export function pickPracticePhrase(seed?: string): string {
  if (seed && PRACTICE_PHRASES.includes(seed)) return seed;
  return PRACTICE_PHRASES[Math.floor(Math.random() * PRACTICE_PHRASES.length)];
}

export function listPracticePhrases(): string[] {
  return [...PRACTICE_PHRASES];
}

export async function assessPronunciation(target: string, transcript: string): Promise<PronunciationAssessment> {
  const cleanTarget = String(target || '').trim();
  const cleanTranscript = String(transcript || '').trim();
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
    tips: problemWords.length
      ? problemWords.map((w) => `Focus on the word "${w}" — say it slowly, then in the full sentence.`)
      : ['Good clarity. Try speaking a little more smoothly without long pauses.'],
    correctedPhrase: cleanTarget,
    encouragingFeedback:
      score >= 80
        ? 'Nice work — your pronunciation is clear enough for conversation.'
        : score >= 60
          ? 'Good effort. A few words need polish, but you are understandable.'
          : 'Keep practicing — focus on one problem word at a time.',
  };

  const llm = await llmPronunciationTips({
    target: cleanTarget,
    transcript: cleanTranscript,
    problemWords,
  });

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

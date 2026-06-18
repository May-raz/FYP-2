import mongoose from 'mongoose';
import { MistakeModel } from '../models/Mistake';
import { QuestionBankModel } from '../models/QuestionBank';
import { QuizResultModel } from '../models/QuizResult';

export interface GeneratedFlashcard {
  cardSubtype:
    | 'vocabulary'
    | 'grammar_correction'
    | 'pronunciation'
    | 'sentence_improvement'
    | 'fill_blank'
    | 'choose_sentence'
    | 'contextual';
  cardFront: string;
  cardBack: string;
  cardExplanation: string;
  originalUtterance: string;
  correctedForm: string;
  errorType: 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other';
  errorTag: string;
  focusWord?: string;
}

export interface GeneratedQuizQuestion {
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  category: string;
  questionType: 'multiple_choice' | 'fill_blank' | 'correct_sentence' | 'choose_sentence' | 'vocabulary_context';
}

const OPENAI_FALLBACK_FLASHCARDS: GeneratedFlashcard[] = [
  {
    cardSubtype: 'choose_sentence',
    cardFront: 'Choose the correct sentence:\nA) He go to university every day.\nB) He goes to university every day.',
    cardBack: 'B) He goes to university every day.',
    cardExplanation: 'Use "goes" with he/she/it in present simple.',
    originalUtterance: 'He go to university every day.',
    correctedForm: 'He goes to university every day.',
    errorType: 'grammar',
    errorTag: 'present_simple_agreement',
    focusWord: 'goes',
  },
  {
    cardSubtype: 'sentence_improvement',
    cardFront: 'Improve this sentence: "I am agree with you."',
    cardBack: 'I agree with you.',
    cardExplanation: 'Do not use "am" before "agree".',
    originalUtterance: 'I am agree with you.',
    correctedForm: 'I agree with you.',
    errorType: 'grammar',
    errorTag: 'verb_pattern',
  },
  {
    cardSubtype: 'pronunciation',
    cardFront: 'Pronounce: comfortable',
    cardBack: 'KUHM-fuh-tuh-bul',
    cardExplanation: 'Stress the first syllable. Do not say "comfort table".',
    originalUtterance: 'comfortable',
    correctedForm: 'comfortable',
    errorType: 'vocabulary',
    errorTag: 'pronunciation',
    focusWord: 'comfortable',
  },
  {
    cardSubtype: 'fill_blank',
    cardFront: 'Fill in the blank: She ___ (study) English every evening.',
    cardBack: 'studies',
    cardExplanation: 'Third-person singular present simple adds -es.',
    originalUtterance: 'She study English every evening.',
    correctedForm: 'She studies English every evening.',
    errorType: 'grammar',
    errorTag: 'present_simple',
    focusWord: 'studies',
  },
  {
    cardSubtype: 'vocabulary',
    cardFront: 'Better word choice: "I did a mistake." → ?',
    cardBack: 'I made a mistake.',
    cardExplanation: 'We say "make a mistake", not "do a mistake".',
    originalUtterance: 'I did a mistake.',
    correctedForm: 'I made a mistake.',
    errorType: 'vocabulary',
    errorTag: 'collocation',
    focusWord: 'made',
  },
  {
    cardSubtype: 'choose_sentence',
    cardFront: 'Choose the correct sentence:\nA) There is many books.\nB) There are many books.',
    cardBack: 'B) There are many books.',
    cardExplanation: '"Books" is plural, so use "are".',
    originalUtterance: 'There is many books.',
    correctedForm: 'There are many books.',
    errorType: 'agreement',
    errorTag: 'subject_verb',
  },
  {
    cardSubtype: 'contextual',
    cardFront: 'Reply naturally: Someone asks "How was your weekend?" Give one full sentence.',
    cardBack: 'It was great — I visited my friends and practiced English.',
    cardExplanation: 'Use a complete sentence with past tense and detail.',
    originalUtterance: 'Good.',
    correctedForm: 'It was great — I visited my friends and practiced English.',
    errorType: 'other',
    errorTag: 'fluency',
  },
  {
    cardSubtype: 'grammar_correction',
    cardFront: 'Fix the tense: "Yesterday I go to the market."',
    cardBack: 'Yesterday I went to the market.',
    cardExplanation: 'Use past simple for finished past actions.',
    originalUtterance: 'Yesterday I go to the market.',
    correctedForm: 'Yesterday I went to the market.',
    errorType: 'tense',
    errorTag: 'past_simple',
    focusWord: 'went',
  },
  {
    cardSubtype: 'choose_sentence',
    cardFront: 'Choose the correct sentence:\nA) She don\'t like tea.\nB) She doesn\'t like tea.',
    cardBack: 'B) She doesn\'t like tea.',
    cardExplanation: 'Use doesn\'t + base verb for she/he/it.',
    originalUtterance: 'She don\'t like tea.',
    correctedForm: 'She doesn\'t like tea.',
    errorType: 'grammar',
    errorTag: 'negation',
    focusWord: "doesn't",
  },
  {
    cardSubtype: 'fill_blank',
    cardFront: 'Fill in: I have been waiting ___ 20 minutes.',
    cardBack: 'for',
    cardExplanation: 'Use "for" with a duration of time.',
    originalUtterance: 'I have been waiting since 20 minutes.',
    correctedForm: 'I have been waiting for 20 minutes.',
    errorType: 'grammar',
    errorTag: 'prepositions',
    focusWord: 'for',
  },
  {
    cardSubtype: 'pronunciation',
    cardFront: 'Pronounce: pronunciation',
    cardBack: 'pruh-nun-see-AY-shun',
    cardExplanation: 'Stress the second syllable: -NUN-.',
    originalUtterance: 'pronunciation',
    correctedForm: 'pronunciation',
    errorType: 'vocabulary',
    errorTag: 'pronunciation',
    focusWord: 'pronunciation',
  },
  {
    cardSubtype: 'sentence_improvement',
    cardFront: 'Improve: "I very like this movie."',
    cardBack: 'I like this movie very much.',
    cardExplanation: '"Very" usually comes before adjectives, not verbs.',
    originalUtterance: 'I very like this movie.',
    correctedForm: 'I like this movie very much.',
    errorType: 'grammar',
    errorTag: 'word_order',
  },
  {
    cardSubtype: 'vocabulary',
    cardFront: 'Better phrase: "I am boring." (when you mean the activity is boring)',
    cardBack: 'I am bored.',
    cardExplanation: 'Bored = feeling; boring = causing the feeling.',
    originalUtterance: 'I am boring.',
    correctedForm: 'I am bored.',
    errorType: 'vocabulary',
    errorTag: 'adjectives',
  },
  {
    cardSubtype: 'choose_sentence',
    cardFront: 'Choose the correct sentence:\nA) I have went home.\nB) I went home.\nC) I have go home.',
    cardBack: 'B) I went home.',
    cardExplanation: 'Past simple for a finished past action.',
    originalUtterance: 'I have went home.',
    correctedForm: 'I went home.',
    errorType: 'tense',
    errorTag: 'past_simple',
  },
  {
    cardSubtype: 'grammar_correction',
    cardFront: 'Fix: "She is more tall than me."',
    cardBack: 'She is taller than me.',
    cardExplanation: 'One-syllable adjectives often take -er.',
    originalUtterance: 'She is more tall than me.',
    correctedForm: 'She is taller than me.',
    errorType: 'grammar',
    errorTag: 'comparatives',
    focusWord: 'taller',
  },
  {
    cardSubtype: 'fill_blank',
    cardFront: 'Complete: I look forward ___ meeting you.',
    cardBack: 'to',
    cardExplanation: 'Fixed phrase: look forward to + noun/gerund.',
    originalUtterance: 'I look forward meeting you.',
    correctedForm: 'I look forward to meeting you.',
    errorType: 'grammar',
    errorTag: 'prepositions',
  },
  {
    cardSubtype: 'pronunciation',
    cardFront: 'Pronounce: development',
    cardBack: 'dih-VEL-uhp-muhnt',
    cardExplanation: 'Stress the second syllable: -VEL-.',
    originalUtterance: 'development',
    correctedForm: 'development',
    errorType: 'vocabulary',
    errorTag: 'pronunciation',
    focusWord: 'development',
  },
  {
    cardSubtype: 'contextual',
    cardFront: 'Give a polite request: You want someone to speak slower.',
    cardBack: 'Could you please speak a little more slowly?',
    cardExplanation: 'Use "Could you please..." for polite requests.',
    originalUtterance: 'Speak slow.',
    correctedForm: 'Could you please speak a little more slowly?',
    errorType: 'other',
    errorTag: 'politeness',
  },
  {
    cardSubtype: 'choose_sentence',
    cardFront: 'Choose the correct sentence:\nA) Me and him went.\nB) He and I went.',
    cardBack: 'B) He and I went.',
    cardExplanation: 'Use subject pronouns: He and I.',
    originalUtterance: 'Me and him went.',
    correctedForm: 'He and I went.',
    errorType: 'grammar',
    errorTag: 'pronouns',
  },
  {
    cardSubtype: 'sentence_improvement',
    cardFront: 'Improve: "I want that you help me."',
    cardBack: 'I want you to help me.',
    cardExplanation: 'Want + person + to + verb.',
    originalUtterance: 'I want that you help me.',
    correctedForm: 'I want you to help me.',
    errorType: 'grammar',
    errorTag: 'verb_patterns',
  },
  {
    cardSubtype: 'vocabulary',
    cardFront: 'Collocation: "do homework" or "make homework"?',
    cardBack: 'do homework',
    cardExplanation: 'We say "do homework", not "make homework".',
    originalUtterance: 'I make my homework.',
    correctedForm: 'I do my homework.',
    errorType: 'vocabulary',
    errorTag: 'collocation',
  },
  {
    cardSubtype: 'grammar_correction',
    cardFront: 'Fix: "If I will have time, I will call you."',
    cardBack: 'If I have time, I will call you.',
    cardExplanation: 'No "will" in the if-clause for first conditional.',
    originalUtterance: 'If I will have time, I will call you.',
    correctedForm: 'If I have time, I will call you.',
    errorType: 'tense',
    errorTag: 'conditionals',
  },
  {
    cardSubtype: 'pronunciation',
    cardFront: 'Pronounce: interesting',
    cardBack: 'IN-truh-sting',
    cardExplanation: 'Stress the first syllable IN-.',
    originalUtterance: 'interesting',
    correctedForm: 'interesting',
    errorType: 'vocabulary',
    errorTag: 'pronunciation',
    focusWord: 'interesting',
  },
  {
    cardSubtype: 'fill_blank',
    cardFront: 'Fill in: She is good ___ math.',
    cardBack: 'at',
    cardExplanation: 'Good at + subject/skill.',
    originalUtterance: 'She is good in math.',
    correctedForm: 'She is good at math.',
    errorType: 'grammar',
    errorTag: 'prepositions',
    focusWord: 'at',
  },
  {
    cardSubtype: 'choose_sentence',
    cardFront: 'Choose the correct sentence:\nA) I have a news.\nB) I have news.\nC) I have an news.',
    cardBack: 'B) I have news.',
    cardExplanation: '"News" is uncountable — no "a".',
    originalUtterance: 'I have a news.',
    correctedForm: 'I have news.',
    errorType: 'grammar',
    errorTag: 'uncountable',
  },
  {
    cardSubtype: 'contextual',
    cardFront: 'Answer in one sentence: What are you studying?',
    cardBack: 'I am studying computer science at university.',
    cardExplanation: 'Use present continuous for current studies.',
    originalUtterance: 'Computer science.',
    correctedForm: 'I am studying computer science at university.',
    errorType: 'other',
    errorTag: 'fluency',
  },
  {
    cardSubtype: 'grammar_correction',
    cardFront: 'Fix: "I didn\'t went there."',
    cardBack: "I didn't go there.",
    cardExplanation: 'After didn\'t, use the base verb.',
    originalUtterance: "I didn't went there.",
    correctedForm: "I didn't go there.",
    errorType: 'tense',
    errorTag: 'past_simple',
    focusWord: 'go',
  },
];

export const DEMO_FLASHCARD_DECK = OPENAI_FALLBACK_FLASHCARDS;

export const EXPANDED_GRAMMAR_QUESTIONS: GeneratedQuizQuestion[] = [
  { questionText: 'Choose the correct sentence.', options: ['She go to school every day.', 'She goes to school every day.', 'She going to school every day.'], correctAnswer: 'She goes to school every day.', explanation: 'Third-person singular uses -s/-es.', difficulty: 1, category: 'present_simple', questionType: 'choose_sentence' },
  { questionText: 'Pick the correct past tense.', options: ['I have went there.', 'I went there.', 'I gone there.'], correctAnswer: 'I went there.', explanation: 'Past simple of go is went.', difficulty: 1, category: 'past_simple', questionType: 'multiple_choice' },
  { questionText: 'Complete: If I ___ more time, I would travel.', options: ['have', 'had', 'will have'], correctAnswer: 'had', explanation: 'Second conditional uses past simple in the if-clause.', difficulty: 2, category: 'conditionals', questionType: 'fill_blank' },
  { questionText: 'Choose the correct article.', options: ['an university', 'a university', 'the university student'], correctAnswer: 'a university', explanation: '"University" starts with a consonant sound.', difficulty: 2, category: 'articles', questionType: 'choose_sentence' },
  { questionText: 'Select the best option.', options: ['There is many books.', 'There are many books.', 'There be many books.'], correctAnswer: 'There are many books.', explanation: 'Plural noun needs "are".', difficulty: 1, category: 'agreement', questionType: 'multiple_choice' },
  { questionText: 'Correct the sentence: "He don\'t like coffee."', options: ['He doesn\'t like coffee.', 'He not like coffee.', 'He don\'t likes coffee.'], correctAnswer: 'He doesn\'t like coffee.', explanation: 'Use doesn\'t + base verb for he/she/it.', difficulty: 1, category: 'negation', questionType: 'correct_sentence' },
  { questionText: 'Fill in: I have lived here ___ 2020.', options: ['since', 'for', 'from'], correctAnswer: 'since', explanation: 'Use "since" with a starting point in time.', difficulty: 2, category: 'prepositions', questionType: 'fill_blank' },
  { questionText: 'Choose the natural collocation.', options: ['do a mistake', 'make a mistake', 'take a mistake'], correctAnswer: 'make a mistake', explanation: 'Collocation is "make a mistake".', difficulty: 2, category: 'vocabulary', questionType: 'vocabulary_context' },
  { questionText: 'Which sentence is correct?', options: ['I am agree.', 'I agree.', 'I agreeing.'], correctAnswer: 'I agree.', explanation: '"Agree" is a verb — no "am" needed.', difficulty: 1, category: 'verb_patterns', questionType: 'choose_sentence' },
  { questionText: 'Pick the best question form.', options: ['What you did yesterday?', 'What did you do yesterday?', 'What you do yesterday?'], correctAnswer: 'What did you do yesterday?', explanation: 'Questions need auxiliary "did" + subject + base verb.', difficulty: 2, category: 'questions', questionType: 'multiple_choice' },
  { questionText: 'Complete: She is taller ___ her brother.', options: ['than', 'then', 'that'], correctAnswer: 'than', explanation: 'Comparatives use "than".', difficulty: 1, category: 'comparatives', questionType: 'fill_blank' },
  { questionText: 'Choose the correct future form.', options: ['I will going tomorrow.', 'I am going tomorrow.', 'I go tomorrow will.'], correctAnswer: 'I am going tomorrow.', explanation: 'Present continuous can express near future plans.', difficulty: 2, category: 'future', questionType: 'choose_sentence' },
  { questionText: 'Select the right plural.', options: ['childs', 'children', 'childes'], correctAnswer: 'children', explanation: 'Irregular plural of child is children.', difficulty: 1, category: 'plurals', questionType: 'multiple_choice' },
  { questionText: 'Fix: "I very like pizza."', options: ['I like pizza very much.', 'I very like pizza much.', 'I like very pizza.'], correctAnswer: 'I like pizza very much.', explanation: '"Very" does not modify verbs directly here.', difficulty: 2, category: 'word_order', questionType: 'correct_sentence' },
  { questionText: 'Choose the correct modal.', options: ['You must to study.', 'You must study.', 'You must studying.'], correctAnswer: 'You must study.', explanation: 'Modal + base verb without "to".', difficulty: 2, category: 'modals', questionType: 'multiple_choice' },
  { questionText: 'Select the correct preposition.', options: ['depend of', 'depend on', 'depend at'], correctAnswer: 'depend on', explanation: 'Collocation: depend on.', difficulty: 2, category: 'prepositions', questionType: 'multiple_choice' },
  { questionText: 'Which is correct?', options: ['less people', 'fewer people', 'few people less'], correctAnswer: 'fewer people', explanation: 'Use fewer with countable nouns.', difficulty: 2, category: 'quantifiers', questionType: 'choose_sentence' },
  { questionText: 'Complete: I have known her ___ 2019.', options: ['for', 'since', 'from'], correctAnswer: 'since', explanation: 'Since + starting point in time.', difficulty: 2, category: 'prepositions', questionType: 'fill_blank' },
  { questionText: 'Pick the right form.', options: ['She suggested me to go.', 'She suggested that I go.', 'She suggested me going.'], correctAnswer: 'She suggested that I go.', explanation: 'Suggest + that-clause (subjunctive/base verb).', difficulty: 3, category: 'verb_patterns', questionType: 'multiple_choice' },
  { questionText: 'Choose the correct passive.', options: ['The book wrote by him.', 'The book was written by him.', 'The book was wrote by him.'], correctAnswer: 'The book was written by him.', explanation: 'Passive: was/were + past participle.', difficulty: 2, category: 'passive', questionType: 'choose_sentence' },
  { questionText: 'Fix word order.', options: ['Always I am tired.', 'I am always tired.', 'I tired am always.'], correctAnswer: 'I am always tired.', explanation: 'Adverbs of frequency go before main verb (after be).', difficulty: 2, category: 'word_order', questionType: 'correct_sentence' },
  { questionText: 'Complete: Neither Tom nor his friends ___ ready.', options: ['is', 'are', 'was'], correctAnswer: 'are', explanation: 'Verb agrees with nearer subject (friends).', difficulty: 3, category: 'agreement', questionType: 'fill_blank' },
  { questionText: 'Choose the best option.', options: ['I look forward to see you.', 'I look forward to seeing you.', 'I look forward see you.'], correctAnswer: 'I look forward to seeing you.', explanation: 'Look forward to + gerund.', difficulty: 2, category: 'gerunds', questionType: 'multiple_choice' },
  { questionText: 'Select correct reported speech.', options: ['He said he is tired.', 'He said he was tired.', 'He said I was tired.'], correctAnswer: 'He said he was tired.', explanation: 'Backshift tense in reported speech.', difficulty: 3, category: 'reported_speech', questionType: 'multiple_choice' },
  { questionText: 'Which sentence is natural?', options: ['I am exciting about the trip.', 'I am excited about the trip.', 'I am excite about the trip.'], correctAnswer: 'I am excited about the trip.', explanation: 'Excited = how you feel.', difficulty: 2, category: 'vocabulary', questionType: 'vocabulary_context' },
  { questionText: 'Complete: She has ___ finished her homework.', options: ['yet', 'already', 'since'], correctAnswer: 'already', explanation: 'Already in present perfect affirmative.', difficulty: 2, category: 'present_perfect', questionType: 'fill_blank' },
  { questionText: 'Pick the correct comparative.', options: ['more easy', 'easier', 'more easier'], correctAnswer: 'easier', explanation: 'Short adjectives: -er comparative.', difficulty: 1, category: 'comparatives', questionType: 'multiple_choice' },
  { questionText: 'Choose the right tag question.', options: ['You are coming, isn\'t it?', 'You are coming, aren\'t you?', 'You are coming, don\'t you?'], correctAnswer: 'You are coming, aren\'t you?', explanation: 'Tag matches auxiliary and subject.', difficulty: 3, category: 'questions', questionType: 'choose_sentence' },
  { questionText: 'Select the correct option.', options: ['I used to living here.', 'I used to live here.', 'I am used to live here.'], correctAnswer: 'I used to live here.', explanation: 'Used to + base verb for past habits.', difficulty: 2, category: 'past_habits', questionType: 'multiple_choice' },
  { questionText: 'Complete: This is the man ___ helped me.', options: ['who', 'which', 'whom he'], correctAnswer: 'who', explanation: 'Who for people as subject.', difficulty: 2, category: 'relative_clauses', questionType: 'fill_blank' },
  { questionText: 'Fix the error.', options: ['Each of the students have a book.', 'Each of the students has a book.', 'Each students has a book.'], correctAnswer: 'Each of the students has a book.', explanation: 'Each takes singular verb.', difficulty: 2, category: 'agreement', questionType: 'correct_sentence' },
  { questionText: 'Choose the correct quantifier.', options: ['How much books?', 'How many books?', 'How many book?'], correctAnswer: 'How many books?', explanation: 'Many with countable plural nouns.', difficulty: 1, category: 'quantifiers', questionType: 'choose_sentence' },
  { questionText: 'Pick the best collocation.', options: ['make a decision', 'do a decision', 'take a decision do'], correctAnswer: 'make a decision', explanation: 'Collocation: make a decision.', difficulty: 2, category: 'vocabulary', questionType: 'vocabulary_context' },
  { questionText: 'Complete: By next year, I ___ graduated.', options: ['will', 'will have', 'have'], correctAnswer: 'will have', explanation: 'Future perfect for completion before future point.', difficulty: 3, category: 'future_perfect', questionType: 'fill_blank' },
  { questionText: 'Which is correct?', options: ['Despite of the rain, we went out.', 'Despite the rain, we went out.', 'Although of the rain, we went out.'], correctAnswer: 'Despite the rain, we went out.', explanation: 'Despite + noun (no of).', difficulty: 2, category: 'contrast', questionType: 'multiple_choice' },
  { questionText: 'Select the right form.', options: ['I enjoy to read.', 'I enjoy reading.', 'I enjoy read.'], correctAnswer: 'I enjoy reading.', explanation: 'Enjoy + gerund.', difficulty: 1, category: 'gerunds', questionType: 'choose_sentence' },
  { questionText: 'Complete: If it rains, we ___ stay home.', options: ['will', 'would', 'had'], correctAnswer: 'will', explanation: 'First conditional: if + present, will + base.', difficulty: 1, category: 'conditionals', questionType: 'fill_blank' },
  { questionText: 'Choose the correct sentence.', options: ['The informations are useful.', 'The information is useful.', 'An information is useful.'], correctAnswer: 'The information is useful.', explanation: 'Information is uncountable.', difficulty: 2, category: 'uncountable', questionType: 'choose_sentence' },
  { questionText: 'Pick the best option.', options: ['She is married with a doctor.', 'She is married to a doctor.', 'She married with a doctor.'], correctAnswer: 'She is married to a doctor.', explanation: 'Married to someone.', difficulty: 2, category: 'prepositions', questionType: 'multiple_choice' },
];

export const DEMO_GRAMMAR_QUESTIONS = EXPANDED_GRAMMAR_QUESTIONS;

async function callOpenAiJson<T>(system: string, user: string): Promise<T | null> {
  const apiKey = String(process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const model = String(process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        response_format: { type: 'json_object' },
        max_tokens: 2200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = String(json?.choices?.[0]?.message?.content ?? '').trim();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isLowValueCard(original: string, corrected: string): boolean {
  const o = original.trim().toLowerCase();
  const c = corrected.trim().toLowerCase();
  if (!o || !c) return true;
  if (o === c) return true;
  if (o.replace(/[.?!]+$/g, '') === c.replace(/[.?!]+$/g, '')) return true;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)\b/.test(o) && o.length < 40) return true;
  if (/\bhow are you\b/i.test(o) && o.length < 80) return true;
  if (/\bemma\b/i.test(o) && o.length < 80 && !o.includes('?')) return true;
  return false;
}

export async function generateFlashcardsWithLlm(args: {
  userId: string;
  mistakesFromSession?: Array<{
    original?: string;
    corrected?: string;
    type?: string;
    explanation?: string;
    word?: string;
  }>;
  recentChat?: Array<{ role: string; content: string }>;
  limit?: number;
}): Promise<GeneratedFlashcard[]> {
  const limit = Math.min(12, Math.max(4, args.limit ?? 8));
  const contextMistakes = (args.mistakesFromSession ?? []).filter(
    (m) => m.original && m.corrected && !isLowValueCard(String(m.original), String(m.corrected))
  );

  const llm = await callOpenAiJson<{ cards: GeneratedFlashcard[] }>(
    `You create English-learning flashcards as JSON only.
Return: { "cards": [ ... ] }
Each card must teach something useful — NEVER copy casual chat greetings verbatim.
cardSubtype: vocabulary|grammar_correction|pronunciation|sentence_improvement|fill_blank|choose_sentence|contextual
Include variety across subtypes.
cardFront = prompt/question. cardBack = answer. cardExplanation = short teaching note.
originalUtterance and correctedForm store the learner mistake pattern (not random chat).`,
    JSON.stringify({
      limit,
      learnerMistakes: contextMistakes.slice(0, 8),
      recentChat: (args.recentChat ?? []).slice(-6),
    })
  );

  let cards = Array.isArray(llm?.cards) ? llm!.cards : [];
  cards = cards
    .map((c) => ({
      ...c,
      cardFront: String(c.cardFront ?? c.originalUtterance ?? '').trim(),
      cardBack: String(c.cardBack ?? c.correctedForm ?? '').trim(),
      cardExplanation: String(c.cardExplanation ?? '').trim(),
      originalUtterance: String(c.originalUtterance ?? c.cardFront ?? '').trim(),
      correctedForm: String(c.correctedForm ?? c.cardBack ?? '').trim(),
      errorType: (['grammar', 'vocabulary', 'tense', 'agreement', 'other'].includes(String(c.errorType))
        ? c.errorType
        : 'grammar') as GeneratedFlashcard['errorType'],
      errorTag: String(c.errorTag ?? 'llm_generated'),
    }))
    .filter((c) => c.cardFront && c.cardBack && !isLowValueCard(c.originalUtterance, c.correctedForm));

  if (cards.length < limit) {
    const needed = limit - cards.length;
    const defaults = OPENAI_FALLBACK_FLASHCARDS.filter(
      (d) => !cards.some((c) => c.cardFront === d.cardFront)
    ).slice(0, needed);
    cards = [...cards, ...defaults];
  }

  return cards.slice(0, limit);
}

export async function persistFlashcards(userId: mongoose.Types.ObjectId, cards: GeneratedFlashcard[]): Promise<string[]> {
  const ids: string[] = [];
  for (const card of cards) {
    const exists = await MistakeModel.findOne({
      userId,
      cardFront: card.cardFront,
    }).lean();
    if (exists) continue;

    const doc = await MistakeModel.create({
      userId,
      sessionId: null,
      originalUtterance: card.originalUtterance,
      correctedForm: card.correctedForm,
      errorType: card.errorType,
      errorTag: card.errorTag,
      cardFront: card.cardFront,
      cardBack: card.cardBack,
      cardExplanation: card.cardExplanation,
      cardSubtype: card.cardSubtype,
      focusWord: card.focusWord ?? '',
      nextReviewDate: new Date(),
      intervalDays: 1,
      easeFactor: 2.5,
      reviewCount: 0,
    });
    ids.push(String(doc._id));
  }
  return ids;
}

export async function ensureQuestionBankSeeded(): Promise<void> {
  for (const q of DEMO_GRAMMAR_QUESTIONS) {
    const exists = await QuestionBankModel.findOne({
      type: 'grammar',
      questionText: q.questionText,
    }).lean();
    if (exists) continue;
    await QuestionBankModel.create({
      type: 'grammar',
      difficulty: q.difficulty,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      errorType: (['grammar', 'vocabulary', 'tense', 'agreement', 'other'].includes(q.category)
        ? q.category
        : 'grammar') as 'grammar' | 'vocabulary' | 'tense' | 'agreement' | 'other',
    });
  }
}

export async function generateQuizQuestionsWithLlm(args: {
  userId: string;
  limit: number;
  difficulty?: number;
  recentMistakes?: string[];
  excludeTexts?: string[];
}): Promise<GeneratedQuizQuestion[]> {
  const limit = Math.min(15, Math.max(10, args.limit));
  const llm = await callOpenAiJson<{ questions: GeneratedQuizQuestion[] }>(
    `Generate fresh English grammar quiz questions as JSON.
Return { "questions": [...] } with exactly ${limit} items.
Each question needs: questionText, options (4 strings for MCQ), correctAnswer, explanation, difficulty (1-3), category, questionType.
Use varied topics: tense, articles, prepositions, collocations, conditionals, modals, word order.
Do NOT repeat these question texts: ${JSON.stringify((args.excludeTexts ?? []).slice(0, 20))}`,
    JSON.stringify({
      difficulty: args.difficulty ?? 2,
      learnerWeakAreas: (args.recentMistakes ?? []).slice(0, 8),
    })
  );

  const questions = Array.isArray(llm?.questions) ? llm!.questions : [];
  const cleaned = questions
    .map((q) => ({
      questionText: String(q.questionText ?? '').trim(),
      options: Array.isArray(q.options) ? q.options.map((o) => String(o)).slice(0, 4) : [],
      correctAnswer: String(q.correctAnswer ?? '').trim(),
      explanation: String(q.explanation ?? '').trim(),
      difficulty: ([1, 2, 3].includes(Number(q.difficulty)) ? Number(q.difficulty) : 2) as 1 | 2 | 3,
      category: String(q.category ?? 'grammar'),
      questionType: (q.questionType ?? 'multiple_choice') as GeneratedQuizQuestion['questionType'],
    }))
    .filter((q) => q.questionText && q.options.length >= 2 && q.correctAnswer);

  if (cleaned.length >= limit) return cleaned.slice(0, limit);

  const fallback = [...EXPANDED_GRAMMAR_QUESTIONS]
    .sort(() => Math.random() - 0.5)
    .filter((q) => !(args.excludeTexts ?? []).includes(q.questionText))
    .slice(0, limit - cleaned.length);

  return [...cleaned, ...fallback].slice(0, limit);
}

export async function getRecentQuizQuestionTexts(userId: mongoose.Types.ObjectId): Promise<string[]> {
  const recent = await QuizResultModel.find({ userId, quizType: 'grammar' })
    .sort({ completedAt: -1 })
    .limit(5)
    .lean();
  const questionIds = recent
    .flatMap((r) => (r.questions ?? []).map((q) => String(q.questionId)))
    .filter((id) => mongoose.isValidObjectId(id));
  if (!questionIds.length) return [];
  const dbQs = await QuestionBankModel.find({ _id: { $in: questionIds } }).lean();
  return dbQs.map((q) => String(q.questionText));
}

export { OPENAI_FALLBACK_FLASHCARDS, isLowValueCard };

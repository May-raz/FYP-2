export function buildProficiencyBreakdown(proficiency = {}, stats = {}) {
  const awaiting = proficiency.awaiting_initial_assessment === true;
  const demo = awaiting || !(proficiency.grammar_score || proficiency.pronunciation_score);
  const grammar = Number(proficiency.grammar_score ?? (demo ? 74 : 70));
  const pronunciation = Number(proficiency.pronunciation_score ?? (demo ? 68 : 70));
  const fluency = Number(proficiency.fluency_score ?? (demo ? 71 : 70));
  const vocabulary = Number(
    stats?.vocabulary_score ?? stats?.basic?.vocabulary_score ?? (demo ? 76 : Math.round((grammar + fluency) / 2))
  );
  const listening = Number(
    stats?.listening_score ?? stats?.basic?.listening_score ?? (demo ? 70 : Math.round((pronunciation + fluency) / 2))
  );
  const confidence = Number(
    stats?.confidence_score ?? stats?.basic?.confidence_score ?? (demo ? 73 : Math.round((grammar + pronunciation + fluency) / 3))
  );
  const tipFor = (score, low, high) => (score < 65 ? low : score < 80 ? high : `${high.split('—')[0].trim()} — keep this momentum.`);
  return [
    { key: 'grammar', label: 'Grammar', score: grammar, tip: tipFor(grammar, 'Review tense and article rules in flashcards.', 'Solid grammar — try harder quiz questions.') },
    { key: 'vocabulary', label: 'Vocabulary', score: vocabulary, tip: tipFor(vocabulary, 'Learn 5 new words daily via vocabulary cards.', 'Great word range — use new words in chat.') },
    { key: 'pronunciation', label: 'Pronunciation', score: pronunciation, tip: tipFor(pronunciation, 'Practice problem sounds with Pronunciation Practice.', 'Clear delivery — keep recording short phrases.') },
    { key: 'fluency', label: 'Fluency', score: fluency, tip: tipFor(fluency, 'Pause less between clauses; speak in full sentences.', 'Good flow — extend to longer topics.') },
    { key: 'listening', label: 'Listening', score: listening, tip: tipFor(listening, 'Replay Emma replies and repeat key phrases.', 'Strong listening — try character chats.') },
    { key: 'confidence', label: 'Confidence', score: confidence, tip: tipFor(confidence, 'Short daily sessions build speaking confidence fast.', 'Confident speaker — challenge yourself in chat.') },
  ];
}

export function buildProgressSummary(profile = {}, stats = {}, gamification = {}) {
  const quizScore = stats?.recent_activity?.avg_grammar_score ?? profile?.recent_scores?.grammar ?? 72;
  const pronScore = stats?.recent_activity?.avg_pronunciation_score ?? profile?.recent_scores?.pronunciation ?? 68;
  const dueCards = gamification?.dueCards ?? 0;
  const breakdown = buildProficiencyBreakdown(profile?.profile || profile, stats);
  const weakest = [...breakdown].sort((a, b) => a.score - b.score)[0];
  const nextAction = dueCards > 0
    ? `Review ${dueCards} due flashcard${dueCards === 1 ? '' : 's'} to reinforce weak areas.`
    : weakest?.key === 'pronunciation'
      ? 'Run Pronunciation Practice on 3 phrases you find difficult.'
      : 'Take a 10-question grammar quiz to measure recent progress.';
  return {
    quizPerformance: `Recent grammar quiz average: ${Math.round(quizScore)}%`,
    weakAreas: weakest ? `${weakest.label} (${weakest.score}%) — ${weakest.tip}` : 'No weak areas flagged yet.',
    pronunciationPractice: `Last session pronunciation: ${Math.round(pronScore)}%. Practice phrases where STT missed words.`,
    nextAction,
  };
}

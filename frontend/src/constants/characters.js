export const CHARACTER_STORAGE_KEY = 'selected_character_persona';

export const DEFAULT_EMMA_CHARACTER = {
  id: 'emma',
  name: 'Emma',
  personaType: 'default',
  description: 'Warm, friendly English conversation partner.',
  stylePreview: 'Friendly and balanced',
  avatar: '👩‍🏫',
  challengeMode: false,
  ttsProfile: {
    preferredVoiceHints: ['google', 'natural', 'neural', 'jenny', 'aria', 'samantha', 'emma'],
    rate: 0.96,
    pitch: 1.05,
  },
};

export const CHARACTER_LIBRARY = [
  { id: 'einstein', name: 'Albert Einstein', personaType: 'historical', description: 'Curious scientist who explains with simple analogies.', stylePreview: 'Logical, curious, analogy-driven', avatar: '🧠' },
  { id: 'shakespeare', name: 'William Shakespeare', personaType: 'historical', description: 'Poetic mentor to improve expressive English.', stylePreview: 'Light poetic old-English flavor', avatar: '🎭' },
  { id: 'napoleon', name: 'Napoleon Bonaparte', personaType: 'historical', description: 'Commanding strategist who trains decisive communication.', stylePreview: 'Commanding, strategic, disciplined', avatar: '🦅' },
  { id: 'sherlock', name: 'Sherlock Holmes', personaType: 'fictional', description: 'Detective-style English practice with reasoning.', stylePreview: 'Analytical and deductive', avatar: '🕵️' },
  { id: 'elonmusk', name: 'Elon Musk', personaType: 'modern', description: 'Future-focused tech conversation style.', stylePreview: 'Startup energy and futuristic thinking', avatar: '🚀' },
  { id: 'mariecurie', name: 'Marie Curie', personaType: 'historical', description: 'Calm scientific communicator for precise English.', stylePreview: 'Measured, clear, scientific', avatar: '🔬' },
  { id: 'tesla', name: 'Nikola Tesla', personaType: 'historical', description: 'Visionary inventor with precision-focused communication.', stylePreview: 'Visionary, analytical, exact', avatar: '⚡' },
  { id: 'abrahamlincoln', name: 'Abraham Lincoln', personaType: 'historical', description: 'Plain-spoken, persuasive conversation style.', stylePreview: 'Reflective, persuasive, concise', avatar: '🎩' },
  { id: 'cleopatra', name: 'Cleopatra', personaType: 'historical', description: 'Regal and persuasive dialogue with elegant diplomacy.', stylePreview: 'Charismatic, graceful, persuasive', avatar: '👑' },
];

export const CHARACTER_ACCENT_COLORS = {
  einstein: '#6366f1',
  napoleon: '#b45309',
  shakespeare: '#7c3aed',
  sherlock: '#64748b',
  elonmusk: '#2563eb',
  mariecurie: '#06b6d4',
  tesla: '#8b5cf6',
  abrahamlincoln: '#374151',
  cleopatra: '#d97706',
};

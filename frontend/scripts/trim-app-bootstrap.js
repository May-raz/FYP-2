const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.js');
const content = fs.readFileSync(appPath, 'utf8');
const marker = '// Landing Page';
const idx = content.indexOf(marker);
if (idx < 0) throw new Error('marker not found');

const header = [
  "import React, { useState, useEffect, useRef, useCallback } from 'react';",
  "import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';",
  "import './App.css';",
  "import { ChatEndModal } from './components/ChatEndModal.jsx';",
  "import { AppToastHost, showAppToast } from './components/AppToast.jsx';",
  "import ProtectedRoute from './components/ProtectedRoute.jsx';",
  "import ThemeToggleFab from './components/ThemeToggleFab.jsx';",
  "import { AuthProvider, useAuth } from './context/AuthContext.jsx';",
  "import { ThemeProvider } from './context/ThemeContext.jsx';",
  "import { axios, API_BASE, GAMIFICATION_BASE, authHeaders, getStoredToken } from './config/api';",
  "import { capitalizeWord, formatIntentLabel, normalizeUserInputPunctuation, cleanVoiceTranscript, normalizeSttText, splitIntoSpeechChunks, getWpmLabel, detectEndIntent } from './utils/text';",
  "import { buildProficiencyBreakdown, buildProgressSummary } from './utils/proficiency';",
  "import { inferMessageEmotion, buildEmotionTrend } from './utils/emotion';",
  "import { computeCompositeProgress } from './utils/xp';",
  "import { preprocessAudioBlob } from './utils/speech';",
  "import { CHARACTER_STORAGE_KEY, DEFAULT_EMMA_CHARACTER, CHARACTER_LIBRARY, CHARACTER_ACCENT_COLORS } from './constants/characters';",
  "import useSpeechRecognition from './hooks/useSpeechRecognition';",
  "import { speakAssistantText, stopAssistantSpeech as stopTts } from './services/ttsService';",
  '',
].join('\n');

const next = header + content.slice(idx);
fs.writeFileSync(appPath, next);
console.log('App.js now', next.split('\n').length, 'lines');

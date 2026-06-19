import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import { ChatEndModal } from './components/ChatEndModal.jsx';
import { AppToastHost, showAppToast } from './components/AppToast.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ThemeToggleFab from './components/ThemeToggleFab.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { axios, API_BASE, GAMIFICATION_BASE, authHeaders, getStoredToken } from './config/api';
import { capitalizeWord, formatIntentLabel, normalizeUserInputPunctuation, cleanVoiceTranscript, normalizeSttText, splitIntoSpeechChunks, getWpmLabel, detectEndIntent } from './utils/text';
import { buildProficiencyBreakdown, buildProgressSummary } from './utils/proficiency';
import { inferMessageEmotion, buildEmotionTrend } from './utils/emotion';
import { computeCompositeProgress } from './utils/xp';
import { preprocessAudioBlob } from './utils/speech';
import { CHARACTER_STORAGE_KEY, DEFAULT_EMMA_CHARACTER, CHARACTER_LIBRARY, CHARACTER_ACCENT_COLORS } from './constants/characters';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import { speakAssistantText, stopAssistantSpeech as stopTts } from './services/ttsService';
// Landing Page
const LandingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) {
    navigate('/stats');
    return null;
  }

  return (
    <div className="landing-page page-enter">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true"></div>
      <div className="ambient-orb ambient-orb-b" aria-hidden="true"></div>
      <div className="ambient-grid" aria-hidden="true"></div>
      <header className="landing-header">
        <nav className="navbar">
          <div className="nav-brand">
            <h2>SpeakWise</h2>
          </div>
          <div className="nav-links">
            <button onClick={() => navigate('/login')} className="btn-secondary">
              Login
            </button>
            <button onClick={() => navigate('/signup')} className="btn-primary">
              Get Started
            </button>
          </div>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="hero-content">
            <p className="section-label">English speaking practice</p>
            <h1>Build real confidence, one conversation at a time</h1>
            <p className="hero-subtitle">
              A speaking-first learning experience with adaptive coaching, voice feedback, and focused study tools.
              Designed to feel personal, not robotic.
            </p>
            <div className="hero-features">
              <div className="feature-badge">Pronunciation Practice</div>
              <div className="feature-badge">Grammar feedback</div>
              <div className="feature-badge">Fluency metrics</div>
              <div className="feature-badge">Character sessions</div>
              <div className="feature-badge">Flashcards & quiz</div>
            </div>
            <div className="hero-buttons">
              <button onClick={() => navigate('/signup')} className="btn-primary btn-large">
                Start session
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="feature-preview">
              <div className="analysis-preview">
                <div className="score-circle">
                  <span className="score">87</span>
                  <span className="label">Overall</span>
                </div>
                <div className="score-breakdown">
                  <div className="score-item">
                    <span>Pronunciation</span>
                    <div className="score-bar">
                      <div className="score-fill pronunciation" style={{width: '84%'}}></div>
                    </div>
                    <span>84%</span>
                  </div>
                  <div className="score-item">
                    <span>Grammar</span>
                    <div className="score-bar">
                      <div className="score-fill grammar" style={{width: '92%'}}></div>
                    </div>
                    <span>92%</span>
                  </div>
                  <div className="score-item">
                    <span>Fluency</span>
                    <div className="score-bar">
                      <div className="score-fill fluency" style={{width: '85%'}}></div>
                    </div>
                    <span>85%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features">
          <div className="container">
            <h2>What you can practice</h2>
            <div className="features-grid">
              <div className="feature-card sw-card">
                <h3>Pronunciation Practice</h3>
                <p>Record phrases and get AI coaching based on speech recognition and phrase comparison.</p>
              </div>
              <div className="feature-card sw-card">
                <h3>Grammar & fluency</h3>
                <p>Corrections, pause patterns, and filler-word awareness while you chat naturally.</p>
              </div>
              <div className="feature-card sw-card">
                <h3>Your level</h3>
                <p>Set your starting level or let Emma adapt based on your performance over time.</p>
              </div>
              <div className="feature-card sw-card">
                <h3>Study tools</h3>
                <p>Flashcards and quizzes reinforce mistakes from chat without interrupting conversation flow.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="container">
          <p>&copy; 2025 SpeakWise. Language learning technology.</p>
        </div>
      </footer>
    </div>
  );
};

// Enhanced Signup Page with Manual Level Selection
const SignupPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: '',
    initialLevel: 'auto'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const result = await signup({
      username: formData.username,
      email: formData.email,
      fullName: formData.fullName,
      password: formData.password,
      initialLevel: formData.initialLevel
    });
    
    if (result.success) {
      navigate('/stats');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="auth-page">
      <div className="auth-container page-enter">
        <div className="auth-header">
          <h1>Start Your Learning Journey</h1>
          <p>Join the next generation of English learning with AI-powered analysis</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="Choose a username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Create a password"
              minLength="6"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="Confirm your password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="initialLevel">Starting Level</label>
            <select
              id="initialLevel"
              name="initialLevel"
              value={formData.initialLevel}
              onChange={handleChange}
              className="level-select"
            >
              <option value="auto">🤖 Let Emma determine automatically</option>
              <option value="beginner">🌱 Beginner - I'm just starting</option>
              <option value="intermediate">🌿 Intermediate - I know some English</option>
              <option value="advanced">🌳 Advanced - I'm quite confident</option>
            </select>
            <small className="helper-text">
              {formData.initialLevel === 'auto'
                ? 'Your scores start at 0. After your first chat message (voice or text), Emma sets your level and scores from that reply—nothing is guessed at signup.'
                : 'You can change this later in your profile.'}
            </small>
          </div>

          <button type="submit" disabled={loading} className="btn-primary btn-full">
            {loading ? 'Creating account...' : 'Start Learning'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <span 
              onClick={() => navigate('/login')} 
              className="auth-link"
            >
              Sign in here
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

// Login Page (unchanged but enhanced error handling)
const LoginPage = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(formData.username, formData.password);
    
    if (result.success) {
      navigate('/stats');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="auth-page">
      <div className="auth-container page-enter">
        <div className="auth-header">
          <h1>Welcome Back!</h1>
          <p>Continue your enhanced English learning journey</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="Enter your username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary btn-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <span 
              onClick={() => navigate('/signup')} 
              className="auth-link"
            >
              Sign up here
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

// Interactive Pronunciation Practice
const AdvancedPronunciationAssessment = ({ onClose, initialPhrase = '' }) => {
  const [phraseItem, setPhraseItem] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [phraseLoading, setPhraseLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const stopRecordingTracks = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const resetPracticeState = useCallback(() => {
    stopTts();
    setTranscript('');
    setAssessment(null);
    setError('');
    setTtsError('');
    setIsAssessing(false);
    stopRecordingTracks();
  }, [stopRecordingTracks]);

  const loadPhrase = useCallback(async ({ excludeText = '', requestedText = '', showInitialSpinner = false } = {}) => {
    if (showInitialSpinner) setInitialLoading(true);
    else setPhraseLoading(true);
    resetPracticeState();
    try {
      const params = new URLSearchParams();
      if (requestedText) params.set('text', requestedText);
      else if (excludeText) params.set('current', excludeText);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await axios.get(`/api/pronunciation/practice-phrase${query}`);
      const item = response.data?.item || {
        text: String(response.data?.phrase || ''),
        difficulty: 'intermediate',
        category: 'daily conversation',
        focusSound: 'clarity',
        breakdown: '',
        tip: 'Speak clearly and naturally.',
      };
      setPhraseItem(item);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load practice phrase');
    } finally {
      if (showInitialSpinner) setInitialLoading(false);
      else setPhraseLoading(false);
    }
  }, [resetPracticeState]);

  useEffect(() => {
    loadPhrase({ requestedText: initialPhrase, showInitialSpinner: true });
  }, [initialPhrase, loadPhrase]);

  const targetPhrase = phraseItem?.text || '';

  const playTarget = useCallback(() => {
    if (!targetPhrase || ttsLoading) return;
    setTtsError('');
    setTtsLoading(true);
    stopTts();
    speakAssistantText(targetPhrase, {
      audioEnabled: true,
      apiBaseUrl: API_BASE,
      authHeaders,
      characterId: 'emma',
      challengeMode: false,
      slow: true,
      onDone: () => setTtsLoading(false),
      onError: (e) => {
        setTtsLoading(false);
        const msg = String(e?.message || '');
        setTtsError(msg.includes('unavailable') || msg.includes('not configured') ? 'Voice service temporarily unavailable.' : msg || 'Could not play audio.');
      },
    });
  }, [targetPhrase, ttsLoading]);

  const startRecording = useCallback(async () => {
    if (!targetPhrase || isAssessing) return;
    resetPracticeState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        if (!blob.size) {
          setError('No audio captured. Please try again.');
          return;
        }
        try {
          const processed = await preprocessAudioBlob(blob);
          const token = getStoredToken();
          const form = new FormData();
          form.append('audio', processed, 'speech.wav');
          form.append('language', 'en');
          const response = await fetch(`${API_BASE || ''}/api/speech/transcribe`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          if (!response.ok) throw new Error('Transcription failed');
          const payload = await response.json();
          const text = cleanVoiceTranscript(String(payload?.text ?? ''));
          if (!text) throw new Error('No speech detected. Speak clearly and try again.');
          setTranscript(text);
          setIsAssessing(true);
          const assessRes = await axios.post('/api/pronunciation/assess', {
            target: targetPhrase,
            transcript: text,
          });
          setAssessment(assessRes.data);
        } catch (err) {
          setError(err.response?.data?.error || err.message || 'Could not assess pronunciation');
        } finally {
          setIsAssessing(false);
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch (_) {
      setError('Microphone access is required for pronunciation practice.');
    }
  }, [targetPhrase, isAssessing, resetPracticeState]);

  useEffect(() => () => {
    stopTts();
    stopRecordingTracks();
  }, [stopRecordingTracks]);

  if (initialLoading) {
    return (
      <div className="assessment-modal modal-enter">
        <div className="modal-content pronunciation-practice-modal">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading pronunciation practice...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="assessment-modal modal-enter">
      <div className="modal-content advanced-assessment pronunciation-practice pronunciation-practice-modal">
        <div className="modal-header">
          <h2>Pronunciation Practice</h2>
          <button type="button" onClick={onClose} className="close-button" aria-label="Close">×</button>
        </div>

        <div className="assessment-content">
          <p className="pronunciation-notice">
            AI estimates pronunciation using speech recognition and phrase comparison — not clinical pronunciation scoring.
          </p>
          <div className="pronunciation-target-card">
            <div className="pronunciation-meta-row">
              <span className="analysis-pill">{phraseItem?.difficulty || 'intermediate'}</span>
              <span className="analysis-pill">{phraseItem?.category || 'practice'}</span>
              <span className="analysis-pill">{`Focus: ${phraseItem?.focusSound || 'clarity'}`}</span>
            </div>
            <h3>Say this phrase</h3>
            <p className="pronunciation-target-text">{targetPhrase}</p>
            {phraseItem?.breakdown ? (
              <p className="pronunciation-breakdown"><strong>Breakdown:</strong> {phraseItem.breakdown}</p>
            ) : null}
            {phraseItem?.tip ? <p className="pronunciation-tip-line">{phraseItem.tip}</p> : null}
            <div className="pronunciation-action-row">
              <button type="button" className="btn-primary" onClick={playTarget} disabled={ttsLoading || phraseLoading}>
                {ttsLoading ? 'Playing...' : '🔊 Hear example'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={phraseLoading}
                onClick={() => loadPhrase({ excludeText: targetPhrase })}
              >
                {phraseLoading ? 'Loading...' : '➡️ New Phrase'}
              </button>
            </div>
            {ttsError ? <p className="pronunciation-tts-error">{ttsError}</p> : null}
          </div>

          <div className="pronunciation-record-card">
            <h3>Your turn</h3>
            <p>Record yourself, then get pronunciation feedback.</p>
            <div className="pronunciation-action-row">
              {!isRecording ? (
                <button type="button" className="btn-primary" onClick={startRecording} disabled={isAssessing || phraseLoading}>
                  🎤 Start Recording
                </button>
              ) : (
                <button type="button" className="btn-secondary" onClick={stopRecordingTracks}>
                  ⏹ Stop & Assess
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={resetPracticeState} disabled={isRecording}>
                🔁 Practice Again
              </button>
            </div>
            {transcript ? <p className="pronunciation-transcript"><strong>What you probably said:</strong> {transcript}</p> : null}
            {error ? <p className="pronunciation-tts-error">{error}</p> : null}
          </div>

          {isAssessing ? (
            <div className="pronunciation-analyzing-block inline-loading">
              <div className="loading-spinner small"></div>
              <span>Analyzing your pronunciation...</span>
            </div>
          ) : null}

          {assessment && (
            <div className="pronunciation-feedback-grid score-reveal">
              <div className="pronunciation-score-row">
                <div className="pronunciation-score-circle score-circle large">
                  <span className="score">{Math.round(assessment.overallScore ?? assessment.score ?? 0)}</span>
                  <span className="label">Score</span>
                </div>
                <div className="pronunciation-feedback-text">
                  <div className="pronunciation-metric-row">
                    <span>Accuracy: <strong>{Math.round(assessment.accuracy ?? 0)}%</strong></span>
                    <span>Fluency: <strong>{Math.round(assessment.fluency ?? 0)}%</strong></span>
                    {typeof assessment.completeness === 'number' ? (
                      <span>Completeness: <strong>{Math.round(assessment.completeness)}%</strong></span>
                    ) : null}
                  </div>
                  {assessment.likelyIssue ? (
                    <p className="pronunciation-likely-issue">{assessment.likelyIssue}</p>
                  ) : null}
                  <p className="encouraging-feedback">{assessment.encouragingFeedback}</p>
                </div>
              </div>
              {!!assessment.missingWords?.length && (
                <div className="analysis-section">
                  <h4>Missing words</h4>
                  <div className="word-tags">
                    {assessment.missingWords.map((w) => <span key={w} className="word-tag">{w}</span>)}
                  </div>
                </div>
              )}
              {!!(assessment.changedWords?.length || assessment.problemWords?.length) && (
                <div className="analysis-section">
                  <h4>Changed / problem words</h4>
                  <div className="word-tags">
                    {(assessment.changedWords?.length ? assessment.changedWords : assessment.problemWords).map((w) => (
                      <span key={w} className="word-tag">{w}</span>
                    ))}
                  </div>
                </div>
              )}
              {assessment.correctedPhrase ? (
                <div className="analysis-section">
                  <h4>Target phrase</h4>
                  <p>{assessment.correctedPhrase}</p>
                </div>
              ) : null}
              {!!assessment.tips?.length && (
                <div className="analysis-section">
                  <h4>Coaching tips</h4>
                  <ul>{assessment.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
              {!!(assessment.practiceChunks?.length || assessment.suggestedPractice?.length) && (
                <div className="analysis-section">
                  <h4>Practice chunks</h4>
                  <ul>{(assessment.practiceChunks?.length ? assessment.practiceChunks : assessment.suggestedPractice).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}</ul>
                </div>
              )}
              {assessment.nextPhraseRecommendation ? (
                <div className="analysis-section">
                  <h4>Try next</h4>
                  <p>{assessment.nextPhraseRecommendation}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// FIX #3: Detailed Progress Analytics Component  
const DetailedProgressAnalytics = ({ onClose }) => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/progress/detailed-analytics');
        const raw = response.data || {};
        const perf = raw.performance || {};
        const growth = raw.growth_metrics || {};
        const activity = raw.activity_analysis || {};
        const consistency = raw.consistency_analysis || {};
        setAnalyticsData({
          current_scores: {
            pronunciation: Number(raw.current_scores?.pronunciation ?? perf.pronunciation ?? 0),
            grammar: Number(raw.current_scores?.grammar ?? perf.grammar ?? 0),
            fluency: Number(raw.current_scores?.fluency ?? perf.fluency ?? 0),
            overall: Number(raw.current_scores?.overall ?? perf.overall ?? 0),
          },
          learning_velocity: {
            pronunciation: Number(raw.learning_velocity?.pronunciation ?? 0),
            grammar: Number(raw.learning_velocity?.grammar ?? 0),
            fluency: Number(raw.learning_velocity?.fluency ?? 0),
          },
          improvement_rate: Number(raw.improvement_rate ?? growth.improvement_rate_per_session ?? 0),
          total_sessions: Number(raw.total_sessions ?? activity.total_sessions ?? 0),
          days_active: Number(raw.days_active ?? growth.days_active ?? 0),
          level_progressions: Number(raw.level_progressions ?? growth.level_progressions ?? 0),
          weekly_session_counts: Array.isArray(raw.weekly_session_counts)
            ? raw.weekly_session_counts
            : (Array.isArray(activity.weekly_session_counts) ? activity.weekly_session_counts : []),
          problem_areas: Array.isArray(raw.problem_areas) ? raw.problem_areas : [],
          strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
          consistency_ratings: {
            pronunciation: String(raw.consistency_ratings?.pronunciation ?? consistency.pronunciation ?? 'Stable'),
            grammar: String(raw.consistency_ratings?.grammar ?? consistency.grammar ?? 'Stable'),
            fluency: String(raw.consistency_ratings?.fluency ?? consistency.fluency ?? 'Stable'),
          },
          milestones_achieved: Array.isArray(raw.milestones_achieved) ? raw.milestones_achieved : [],
          predictive_insights: Array.isArray(raw.predictive_insights)
            ? raw.predictive_insights
            : (Array.isArray(raw.key_insights) ? raw.key_insights : []),
          next_goals: Array.isArray(raw.next_goals) ? raw.next_goals : [],
          analytics_summary: String(raw.analytics_summary ?? 'Analytics data loaded.'),
        });
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="analytics-modal">
        <div className="modal-content">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading detailed progress analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-modal">
        <div className="modal-content">
          <div className="error-message">
            <h3>Analytics Error</h3>
            <p>{error}</p>
            <button onClick={onClose} className="btn-primary">Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-modal">
      <div className="modal-content detailed-analytics">
        <div className="modal-header">
          <h2>Your Progress</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <div className="analytics-content">
          <div className="overview-section">
            <h3>📊 Current Performance Overview</h3>
            <div className="performance-grid">
              <div className="perf-card pronunciation">
                <h4>🗣️ Pronunciation</h4>
                <div className="perf-score">{analyticsData.current_scores.pronunciation}%</div>
                <div className="velocity">
                  {analyticsData.learning_velocity.pronunciation > 0 ? '📈' : 
                   analyticsData.learning_velocity.pronunciation < 0 ? '📉' : '➡️'} 
                  {analyticsData.learning_velocity.pronunciation > 0 ? '+' : ''}{analyticsData.learning_velocity.pronunciation}%
                </div>
              </div>
              <div className="perf-card grammar">
                <h4>📝 Grammar</h4>
                <div className="perf-score">{analyticsData.current_scores.grammar}%</div>
                <div className="velocity">
                  {analyticsData.learning_velocity.grammar > 0 ? '📈' : 
                   analyticsData.learning_velocity.grammar < 0 ? '📉' : '➡️'} 
                  {analyticsData.learning_velocity.grammar > 0 ? '+' : ''}{analyticsData.learning_velocity.grammar}%
                </div>
              </div>
              <div className="perf-card fluency">
                <h4>⚡ Fluency</h4>
                <div className="perf-score">{analyticsData.current_scores.fluency}%</div>
                <div className="velocity">
                  {analyticsData.learning_velocity.fluency > 0 ? '📈' : 
                   analyticsData.learning_velocity.fluency < 0 ? '📉' : '➡️'} 
                  {analyticsData.learning_velocity.fluency > 0 ? '+' : ''}{analyticsData.learning_velocity.fluency}%
                </div>
              </div>
              <div className="perf-card overall">
                <h4>🎯 Overall</h4>
                <div className="perf-score">{analyticsData.current_scores.overall}%</div>
                <div className="improvement-rate">
                  Rate: {analyticsData.improvement_rate.toFixed(1)}%/session
                </div>
              </div>
            </div>
          </div>

          <div className="analytics-grid">
            <div className="analytics-section">
              <h3>📅 Learning Activity</h3>
              <div className="activity-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Sessions:</span>
                  <span className="stat-value">{analyticsData.total_sessions}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Active Days:</span>
                  <span className="stat-value">{analyticsData.days_active}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Level Changes:</span>
                  <span className="stat-value">{analyticsData.level_progressions}</span>
                </div>
              </div>
              
              {analyticsData.weekly_session_counts.length > 0 && (
                <div className="weekly-chart">
                  <h4>Weekly Sessions</h4>
                  <div className="chart-bars">
                    {analyticsData.weekly_session_counts.map((count, index) => (
                      <div key={index} className="chart-bar">
                        <div 
                          className="bar-fill" 
                          style={{height: `${Math.max((count / Math.max(...analyticsData.weekly_session_counts)) * 100, 10)}%`}}
                          title={`Week ${index + 1}: ${count} sessions`}
                        ></div>
                        <span className="bar-label">W{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="analytics-section">
              <h3>🎯 Problem Areas</h3>
              <ul className="problem-areas-list">
                {analyticsData.problem_areas.map((area, index) => (
                  <li key={index} className="problem-item">
                    <span className="problem-icon">⚠️</span>
                    {area}
                  </li>
                ))}
              </ul>
            </div>

            <div className="analytics-section">
              <h3>💪 Your Strengths</h3>
              <ul className="strengths-list">
                {analyticsData.strengths.map((strength, index) => (
                  <li key={index} className="strength-item">
                    <span className="strength-icon">✅</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>

            <div className="analytics-section">
              <h3>🔮 Performance Consistency</h3>
              <div className="consistency-grid">
                <div className="consistency-item">
                  <span className="skill-name">Pronunciation:</span>
                  <span className={`consistency-level ${analyticsData.consistency_ratings.pronunciation.toLowerCase()}`}>
                    {analyticsData.consistency_ratings.pronunciation}
                  </span>
                </div>
                <div className="consistency-item">
                  <span className="skill-name">Grammar:</span>
                  <span className={`consistency-level ${analyticsData.consistency_ratings.grammar.toLowerCase()}`}>
                    {analyticsData.consistency_ratings.grammar}
                  </span>
                </div>
                <div className="consistency-item">
                  <span className="skill-name">Fluency:</span>
                  <span className={`consistency-level ${analyticsData.consistency_ratings.fluency.toLowerCase()}`}>
                    {analyticsData.consistency_ratings.fluency}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="milestones-section">
            <h3>🏆 Milestones Achieved</h3>
            <div className="milestones-grid">
              {analyticsData.milestones_achieved.map((milestone, index) => (
                <div key={index} className="milestone-badge">
                  {milestone}
                </div>
              ))}
            </div>
          </div>

          {analyticsData.predictive_insights.length > 0 && (
            <div className="insights-section">
              <h3>🔮 Predictive Insights</h3>
              <ul className="insights-list">
                {analyticsData.predictive_insights.map((insight, index) => (
                  <li key={index} className="insight-item">
                    <span className="insight-icon">💡</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="next-goals-section">
            <h3>🎯 Next Goals</h3>
            <ul className="goals-list">
              {analyticsData.next_goals.map((goal, index) => (
                <li key={index} className="goal-item">
                  <span className="goal-icon">🎯</span>
                  {goal}
                </li>
              ))}
            </ul>
          </div>

          <div className="summary-section">
            <h3>📋 Analytics Summary</h3>
            <p>{analyticsData.analytics_summary}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Dashboard Component (FIX #3)
const Dashboard = () => {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [gamification, setGamification] = useState({
    profile: null,
    streak: null,
    leaderboard: [],
    dueCards: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdvancedAssessment, setShowAdvancedAssessment] = useState(false);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.openPronunciation) {
      setShowAdvancedAssessment(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const profilePromise = axios.get('/api/user/profile').catch(err => {
        console.error('Profile fetch error:', err);
        throw new Error('Failed to load profile');
      });

      const statsPromise = axios.get('/api/user/stats').catch(err => {
        console.error('Stats fetch error:', err);
        return {
          data: {
            basic: { total_sessions: 0, average_wpm: 0, current_wpm: 0, best_wpm: 0, session_wpm: 0, weekly_wpm_trend: [] },
            proficiency: {
              overall_score: 0,
              pronunciation_score: 0,
              grammar_score: 0,
              fluency_score: 0,
              current_level: 'beginner',
              current_persona: 'beginner'
            },
            vocabulary: { mispronounced: 0 },
            recent_activity: {
              avg_pronunciation_score: 0,
              avg_grammar_score: 0,
              total_errors_corrected: 0
            }
          }
        };
      });

      const gamiPromise = (async () => {
        try {
          const headers = authHeaders();
          const [gProfile, gStreak, gLeaderboard, gFlashcards] = await Promise.all([
            axios.get(`${GAMIFICATION_BASE}/api/v1/gamification/profile/self`, { headers, timeout: 10000 }),
            axios.get(`${GAMIFICATION_BASE}/api/v1/gamification/streak/self`, { headers, timeout: 10000 }),
            axios.get(`${GAMIFICATION_BASE}/api/v1/gamification/leaderboard?scope=weekly&persona=diplomat&limit=5`, { headers, timeout: 10000 }),
            axios.get(`${GAMIFICATION_BASE}/api/v1/gamification/flashcards/due/me?limit=20`, { headers, timeout: 10000 }),
          ]);
          return {
            profile: gProfile.data,
            streak: gStreak.data,
            leaderboard: gLeaderboard.data?.entries || [],
            dueCards: Array.isArray(gFlashcards.data?.cards) ? gFlashcards.data.cards.length : 0,
          };
        } catch (e) {
          if (e?.response?.status === 401) {
            logout();
            navigate('/login', {
              state: { message: 'Session expired for gamification. Please log in again.' }
            });
          }
          console.warn('Gamification fetch warning:', {
            base: GAMIFICATION_BASE,
            status: e?.response?.status,
            code: e?.code,
            message: e?.message || String(e),
          });
          return { profile: null, streak: null, leaderboard: [], dueCards: 0 };
        }
      })();

      const [profileRes, statsRes, gami] = await Promise.all([profilePromise, statsPromise, gamiPromise]);
      setProfile(profileRes.data);
      setStats(statsRes.data);
      setGamification(gami);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError(error.message || 'Failed to load dashboard data');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [logout, navigate]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      fetchDashboardData({ silent: true });
    }, 20000);
    const onFocus = () => fetchDashboardData({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your enhanced dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-container">
        <div className="error-message">
          <h3>Dashboard Error</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="loading-container">
        <div className="error-message">
          <h3>Profile Not Found</h3>
          <p>Unable to load your profile. Please try logging in again.</p>
          <button onClick={logout} className="btn-primary">
            Login Again
          </button>
        </div>
      </div>
    );
  }

  const proficiency = stats.proficiency || {};
  const levelEmojis = {
    'beginner': '🌱',
    'intermediate': '🌿', 
    'advanced': '🌳',
    'native': '🏆'
  };

  const isAutoLevel = profile.profile?.preferences?.auto_level_adjustment !== false;
  const awaitingAssessment = profile.profile?.awaiting_initial_assessment === true;
  const progress = computeCompositeProgress(gamification.profile);
  const {
    compositeLevel,
    compositeXp,
    nextLevel,
    xpToNext,
    progressPct,
    currentThreshold,
    nextThreshold,
    atMaxLevel,
  } = progress;
  const hour = new Date().getHours();
  const greetingLabel = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const overallScore = Number(proficiency.overall_score ?? 0);
  const motivationalLine = awaitingAssessment
    ? 'One message unlocks your adaptive learning profile.'
    : overallScore >= 80
      ? 'You are building fluent confidence. Keep this momentum.'
      : overallScore >= 60
        ? 'You are progressing steadily. Small daily sessions will compound fast.'
        : 'Every sentence is progress. Keep your pace consistent and focused.';

  return (
    <div className="dashboard page-enter">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true"></div>
      <div className="ambient-orb ambient-orb-b" aria-hidden="true"></div>
      <div className="ambient-grid" aria-hidden="true"></div>
      {awaitingAssessment && (
        <div className="dashboard-assessment-notice">
          <strong>Level not measured yet.</strong> Open chat and send one message (typed or voice). Your first reply
          sets your starting scores and level when &quot;Let Emma decide&quot; is on.
        </div>
      )}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>{greetingLabel}, {profile.full_name}! {levelEmojis[proficiency.current_level] || '👋'}</h1>
          <p>
            Current Level: <span className="level-badge">{proficiency.current_level || 'Beginner'}</span> 
            {!isAutoLevel && <span className="manual-badge">📍 Manual</span>}
            {' '}
            | Overall Score:{' '}
            <span className="score-badge" title={awaitingAssessment ? 'Chat once to get your score' : ''}>
              {awaitingAssessment ? 'Not set yet' : `${proficiency.overall_score ?? 0}%`}
            </span>
          </p>
          <p className="dashboard-emotional-line">{motivationalLine}</p>
        </div>
        <div className="header-actions">
          <button onClick={() => navigate('/profile')} className="btn-secondary">
            Profile Settings
          </button>
          <button onClick={logout} className="btn-outline">
            Logout
          </button>
        </div>
      </header>

      <section className="dashboard-story-rail">
        <article className="story-card">
          <h3>Daily Focus</h3>
          <p>
            {awaitingAssessment
              ? 'Start with one short voice message to calibrate your plan.'
              : (gamification.dueCards || 0) > 0
                ? `Review ${gamification.dueCards} due flashcards to stabilize grammar XP gains.`
                : 'No flashcards due. Keep momentum with one focused speaking round.'}
          </p>
        </article>
        <article className="story-card">
          <h3>Confidence Loop</h3>
          <p>
            {`Streak ${gamification.streak?.current || 0} day(s): speak, review one correction, and repeat. Consistency multiplies progress.`}
          </p>
        </article>
        <article className="story-card">
          <h3>Momentum</h3>
          <p>
            {atMaxLevel
              ? 'You reached mastery tier; maintain consistency to stay sharp.'
              : `${xpToNext} XP to next level. Weekly XP: ${gamification.profile?.weeklySnapshot?.xpEarned || 0} from ${gamification.profile?.weeklySnapshot?.sessionsCompleted || 0} sessions.`}
          </p>
        </article>
      </section>

      <div className="dashboard-grid">
        {/* Enhanced Proficiency Overview */}
        <div className="proficiency-overview dashboard-section">
          <p className="section-label">Proficiency</p>
          <h2>Your Proficiency Breakdown</h2>
          <div className="proficiency-scores">
            <div className="score-circle-container">
              <div className="score-circle large">
                <span className="score">{awaitingAssessment ? '—' : (proficiency.overall_score ?? 0)}</span>
                <span className="label">Overall</span>
              </div>
            </div>
            <div className="score-breakdown">
              <div className="score-item">
                <span className="score-label">Pronunciation</span>
                <div className="score-bar">
                  <div className="score-fill pronunciation" 
                       style={{width: `${proficiency.pronunciation_score || 0}%`}}></div>
                </div>
                <span className="score-value">{proficiency.pronunciation_score || 0}%</span>
              </div>
              <div className="score-item">
                <span className="score-label">Grammar</span>
                <div className="score-bar">
                  <div className="score-fill grammar" 
                       style={{width: `${proficiency.grammar_score || 0}%`}}></div>
                </div>
                <span className="score-value">{proficiency.grammar_score || 0}%</span>
              </div>
              <div className="score-item">
                <span className="score-label">Fluency</span>
                <div className="score-bar">
                  <div className="score-fill fluency" 
                       style={{width: `${proficiency.fluency_score || 0}%`}}></div>
                </div>
                <span className="score-value">{proficiency.fluency_score || 0}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Statistics */}
        <div className="stats-overview dashboard-section">
          <p className="section-label">Statistics</p>
          <h2>Learning Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">💬</div>
              <div className="stat-content">
                <h3>{stats.basic?.total_sessions || 0}</h3>
                <p>Conversations</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🗣️</div>
              <div className="stat-content">
                <h3>{stats.recent_activity?.avg_pronunciation_score || 0}%</h3>
                <p>Avg Pronunciation</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📝</div>
              <div className="stat-content">
                <h3>{stats.recent_activity?.avg_grammar_score || 0}%</h3>
                <p>Avg Grammar</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⚡</div>
              <div className="stat-content">
                <h3>{stats.basic?.average_wpm || 0}</h3>
                <p>Avg WPM</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🎙️</div>
              <div className="stat-content">
                <h3>{stats.basic?.current_wpm || 0}</h3>
                <p>Current WPM</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🚀</div>
              <div className="stat-content">
                <h3>{stats.basic?.best_wpm || 0}</h3>
                <p>Best WPM</p>
              </div>
            </div>
          </div>
          <div className="wpm-trend-row">
            <span><strong>Session WPM:</strong> {stats.basic?.session_wpm || 0}</span>
            <span><strong>Speed Zone:</strong> {getWpmLabel(stats.basic?.average_wpm || 0)}</span>
            <span><strong>Weekly trend:</strong> {(stats.basic?.weekly_wpm_trend || []).join(' / ') || 'No data yet'}</span>
          </div>
        </div>

        <div className="stats-overview gamification-overview dashboard-section">
          <p className="section-label">Gamification</p>
          <h2>Gamification Progress</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-content">
                <h3>{gamification.profile?.levels?.composite || 1}</h3>
                <p>Composite Level</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🔥</div>
              <div className="stat-content">
                <h3>{gamification.streak?.current || 0}</h3>
                <p>Current Streak</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🃏</div>
              <div className="stat-content">
                <h3>{gamification.dueCards || 0}</h3>
                <p>Flashcards Due</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏅</div>
              <div className="stat-content">
                <h3>{gamification.profile?.weeklySnapshot?.xpEarned || 0}</h3>
                <p>Weekly XP</p>
              </div>
            </div>
          </div>
          <div className="mini-leaderboard">
            <h3>Weekly Leaderboard</h3>
            {(gamification.leaderboard || []).slice(0, 3).map((entry) => (
              <div key={entry.rank} className="leader-row">
                <span>#{entry.rank} {entry.username}</span>
                <span>Lv {entry.compositeLevel}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions - FIX #3: Made components functional */}
        <div className="quick-actions dashboard-section">
          <p className="section-label">Actions</p>
          <h2>Continue Learning</h2>
          <div className="action-cards">
            <div className="action-card primary" onClick={() => navigate('/chat')}>
              <div className="action-icon">🎯</div>
              <h3>Chat with Emma</h3>
              <p>Get real-time pronunciation, grammar, and fluency feedback</p>
            </div>
            <div className="action-card primary" onClick={() => navigate('/characters')}>
              <div className="action-icon">🏛️</div>
              <h3>Talk to Historical Persons</h3>
              <p>Practice English with Einstein, Shakespeare, Sherlock, Curie, Lincoln, and more</p>
            </div>
            <div className="action-card" onClick={() => setShowAdvancedAssessment(true)}>
              <div className="action-icon">📊</div>
              <h3>Pronunciation Practice</h3>
              <p>Practice with drill-based exercises and pronunciation analysis</p>
            </div>
            <div className="action-card" onClick={() => setShowDetailedAnalytics(true)}>
              <div className="action-icon">📈</div>
              <h3>Your Progress</h3>
              <p>View comprehensive trends and improvement areas</p>
            </div>
            <div className="action-card" onClick={() => navigate('/flashcards')}>
              <div className="action-icon">🃏</div>
              <h3>Flashcard Review</h3>
              <p>Review due cards and earn grammar XP with spaced repetition</p>
            </div>
            <div className="action-card" onClick={() => navigate('/quiz')}>
              <div className="action-icon">🧠</div>
              <h3>Grammar Quiz</h3>
              <p>Take quizzes to unlock more XP and improve weak areas</p>
            </div>
            <div className="action-card" onClick={() => navigate('/leaderboard')}>
              <div className="action-icon">🏆</div>
              <h3>Leaderboard</h3>
              <p>Compare your weekly rank with other learners</p>
            </div>
          </div>
        </div>

        {/* Enhanced Recent Activity */}
        <div className="recent-activity dashboard-section">
          <p className="section-label">Activity</p>
          <h2>Recent Progress</h2>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-icon">🎭</span>
              <span>
                Current persona: <strong>{proficiency.current_persona || 'Beginner'}</strong> Emma
                {!isAutoLevel && <em> (Manual Selection)</em>}
              </span>
            </div>
            <div className="activity-item">
              <span className="activity-icon">📊</span>
              <span>Pronunciation errors to work on: {stats.vocabulary?.mispronounced || 0}</span>
            </div>
            <div className="activity-item">
              <span className="activity-icon">📝</span>
              <span>Grammar corrections made: {stats.recent_activity?.total_errors_corrected || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* FIX #3: Modal components for dashboard actions */}
      {showAdvancedAssessment && (
        <AdvancedPronunciationAssessment onClose={() => setShowAdvancedAssessment(false)} />
      )}

      {showDetailedAnalytics && (
        <DetailedProgressAnalytics onClose={() => setShowDetailedAnalytics(false)} />
      )}
    </div>
  );
};

// Session wrap-up after "End chat" (short, friendly — no grading UI)
const SessionSummary = ({ summary, onClose, onBackToDashboard, onDownload, navigate }) => {
  if (!summary) return null;

  const partner =
    typeof summary.summary === 'string' &&
    summary.summary.length > 0 &&
    Array.isArray(summary.improvements);

  const handlePracticePronunciation = () => {
    onClose?.();
    navigate('/stats', { state: { openPronunciation: true } });
  };
  const handleReviewFlashcards = () => {
    onClose?.();
    navigate('/flashcards');
  };
  const handleViewProgress = () => {
    onClose?.();
    navigate('/profile');
  };

  if (partner) {
    return (
      <ChatEndModal
        title="Chat summary"
        summary={summary.summary}
        improvements={summary.improvements}
        messageCount={summary.message_count}
        durationLabel={summary.duration_label}
        emotionTrend={summary.emotion_trend}
        onStartNewChat={onClose}
        onDownloadTranscript={onDownload}
        onBackToDashboard={onBackToDashboard}
        onPracticePronunciation={handlePracticePronunciation}
        onReviewFlashcards={handleReviewFlashcards}
        onViewProgress={handleViewProgress}
      />
    );
  }

  return (
    <div className="session-summary-modal">
      <div className="summary-content">
        <div className="summary-header">
          <h2>📊 Chat Session Summary</h2>
          <div className="session-stats">
            <span>Messages: {summary.session_stats?.messages_sent || 0}</span>
            <span>Duration: Practice Session</span>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-section achievements">
            <h3>🏆 Achievements</h3>
            <ul>
              {(summary.achievements || []).map((achievement, index) => (
                <li key={index} className="achievement-item">
                  {achievement}
                </li>
              ))}
            </ul>
          </div>

          <div className="summary-section scores">
            <h3>📈 Session Scores</h3>
            <div className="score-grid">
              <div className="score-item">
                <span className="score-label">Pronunciation</span>
                <span className="score-value">{summary.session_stats?.avg_pronunciation_score || 0}%</span>
              </div>
              <div className="score-item">
                <span className="score-label">Grammar</span>
                <span className="score-value">{summary.session_stats?.avg_grammar_score || 0}%</span>
              </div>
              <div className="score-item">
                <span className="score-label">Fluency</span>
                <span className="score-value">{summary.session_stats?.avg_fluency_score || 0}%</span>
              </div>
            </div>
          </div>

          <div className="summary-section weaknesses">
            <h3>⚠️ Areas to Improve</h3>
            <ul>
              {(summary.weaknesses || []).map((weakness, index) => (
                <li key={index} className="weakness-item">
                  {weakness}
                </li>
              ))}
            </ul>
          </div>

          <div className="summary-section recommendations">
            <h3>💡 Next Steps</h3>
            <ul>
              {(summary.recommendations || []).map((recommendation, index) => (
                <li key={index} className="recommendation-item">
                  {recommendation}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {summary.mispronounced_words && summary.mispronounced_words.length > 0 && (
          <div className="summary-section words-to-practice">
            <h3>📚 Words to Practice</h3>
            <div className="word-tags">
              {summary.mispronounced_words.map((word, index) => (
                <span key={index} className="word-tag">{word}</span>
              ))}
            </div>
          </div>
        )}

        <div className="summary-text">
          <p>{summary.summary_text}</p>
        </div>

        <section className="session-recommend-banner" aria-label="Recommended next steps">
          <p className="session-recommend-title">Great session!</p>
          <p className="session-recommend-copy">
            Want to improve the words you struggled with? Try Pronunciation Practice.
          </p>
          <div className="session-recommend-actions">
            <button type="button" className="btn-primary" onClick={handlePracticePronunciation}>Practice Pronunciation</button>
            <button type="button" className="btn-secondary" onClick={handleReviewFlashcards}>Review Flashcards</button>
            <button type="button" className="btn-secondary" onClick={handleViewProgress}>View Progress</button>
          </div>
        </section>

        <div className="summary-actions">
          <button type="button" onClick={onClose} className="btn-secondary">
            Start New Chat
          </button>
          <button type="button" onClick={onBackToDashboard} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

// Enhanced Chat Component with FIX #1, #4, #5
const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [isEndingChat, setIsEndingChat] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [streamingBotText, setStreamingBotText] = useState('');
  const [liveAnalysis, setLiveAnalysis] = useState(null);
  const [isAnalyzingLive, setIsAnalyzingLive] = useState(false);
  const [emotionState, setEmotionState] = useState(null);
  const [liveWpm, setLiveWpm] = useState(0);
  const [liveWpmLabel, setLiveWpmLabel] = useState('Moderate');
  const [characterLoadingLine, setCharacterLoadingLine] = useState('Emma is typing...');
  const navigate = useNavigate();
  const location = useLocation();
  const isHistoricalMode = location.pathname.startsWith('/chat/character');
  const messagesEndRef = useRef(null);
  const ttsGenerationRef = useRef(0);
  const isListeningRef = useRef(false);
  const messagesRef = useRef([]);
  const retryCountRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const typingStartRef = useRef(0);
  const lastKeyTsRef = useRef(0);
  const keyPauseSumRef = useRef(0);
  const keyPauseCountRef = useRef(0);
  const backspaceCountRef = useRef(0);
  const voiceStartRef = useRef(0);
  const voiceSilenceMsRef = useRef(0);
  const speechActiveMsRef = useRef(0);
  const speechSilenceMsRef = useRef(0);
  const speechLastTickRef = useRef(0);
  const speechLastTranscriptChangeRef = useRef(0);
  const speechWordCountRef = useRef(0);
  const pendingVoiceCaptureRef = useRef(null);
  const liveWpmUiTickRef = useRef(0);
  const activeSessionIdRef = useRef(
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  );
  const [selectedCharacter, setSelectedCharacter] = useState(() => {
    if (!location.pathname.startsWith('/chat/character')) {
      return DEFAULT_EMMA_CHARACTER;
    }
    const fromRoute = location.state?.selectedCharacter;
    if (fromRoute?.id) return { ...fromRoute, challengeMode: Boolean(fromRoute.challengeMode) };
    try {
      const stored = JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) || 'null');
      if (stored?.id) return { ...stored, challengeMode: Boolean(stored.challengeMode) };
    } catch (_) {
      // ignore parse errors
    }
    return DEFAULT_EMMA_CHARACTER;
  });

  const { logout } = useAuth();

  useEffect(() => {
    if (!isHistoricalMode) {
      setSelectedCharacter(DEFAULT_EMMA_CHARACTER);
      return;
    }
    if (location.state?.selectedCharacter?.id) {
      setSelectedCharacter({
        ...location.state.selectedCharacter,
        challengeMode: Boolean(location.state.selectedCharacter.challengeMode),
      });
    }
  }, [isHistoricalMode, location.state]);

  useEffect(() => {
    if (!isHistoricalMode) return;
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(selectedCharacter));
  }, [isHistoricalMode, selectedCharacter]);

  useEffect(() => {
    if (!isHistoricalMode || !selectedCharacter?.id || selectedCharacter.id === 'emma') {
      setCharacterLoadingLine('Emma is typing...');
      return;
    }
    const lines = selectedCharacter?.ambiance?.loadingLines;
    if (Array.isArray(lines) && lines.length) {
      setCharacterLoadingLine(lines[Math.floor(Math.random() * lines.length)]);
      return;
    }
    setCharacterLoadingLine(`${selectedCharacter?.name || 'Character'} is replying...`);
  }, [isHistoricalMode, selectedCharacter, messages.length]);

  const buildSessionMistakes = useCallback((msgs) => {
    const out = [];
    const seen = new Set();
    for (const m of msgs || []) {
      const corrections = m.chatFeedback?.corrections || m.corrections || [];
      for (const c of corrections) {
        const original = String(c.original || '').trim();
        const corrected = String(c.corrected || '').trim();
        if (!original || !corrected) continue;
        if (original.toLowerCase() === corrected.toLowerCase()) continue;
        const key = `${original}::${corrected}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          originalUtterance: original,
          correctedForm: corrected,
          errorType: c.type === 'pronunciation' || c.type === 'vocabulary' ? 'vocabulary' : 'grammar',
          errorTag: `chat_${c.type || 'grammar'}`,
          explanation: c.explanation,
          focusWord: c.word,
        });
        if (out.length >= 8) break;
      }
      const tips = m.chatFeedback?.pronunciationTips || [];
      for (const t of tips) {
        const word = String(t.word || '').trim();
        if (!word) continue;
        const key = `pron:${word}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          originalUtterance: word,
          correctedForm: word,
          errorType: 'vocabulary',
          errorTag: 'pronunciation_tip',
          explanation: t.tip,
          focusWord: word,
        });
        if (out.length >= 8) break;
      }
      if (out.length >= 8) break;
    }
    return out;
  }, []);

  const syncGamificationForSession = useCallback(async (msgs, emotionTrend) => {
    try {
      const userTurns = (msgs || []).filter((m) => m.type === 'user').length;
      if (!userTurns) return;

      const dominant = (emotionTrend || [])
        .slice()
        .sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.label || 'neutral';
      const anxietyFlag = dominant === 'sad' || dominant === 'angry';
      const sessionId =
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

      // Reuse real profile metrics so gamification progression reflects current learner state.
      let scores = { fluency: 70, grammar: 70, eq: 70 };
      try {
        const statsRes = await axios.get('/api/user/stats', { timeout: 10000 });
        const proficiency = statsRes.data?.proficiency || {};
        scores = {
          fluency: Number(proficiency.fluency_score ?? 70),
          grammar: Number(proficiency.grammar_score ?? 70),
          eq: Number(proficiency.overall_score ?? 70),
        };
      } catch (e) {
        console.warn('Could not load stats for gamification sync, using fallback scores');
      }

      const headers = authHeaders();
      await axios.post(
        `${GAMIFICATION_BASE}/api/v1/gamification/session/complete`,
        {
          sessionId,
          scores,
          turnCount: userTurns,
          emotionProfile: { dominant, anxietyFlag },
          sessionCompleted: true,
          mistakes: buildSessionMistakes(msgs),
        },
        { headers, timeout: 12000 }
      );
    } catch (err) {
      console.warn('Gamification session sync failed, attempting micro-session fallback', err);
      try {
        const dominant = (emotionTrend || [])
          .slice()
          .sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.label || 'neutral';
        await axios.post(
          `${GAMIFICATION_BASE}/api/v1/gamification/micro-session`,
          { emotionProfile: { dominant, anxietyFlag: dominant === 'sad' || dominant === 'angry' } },
          { headers: authHeaders(), timeout: 10000 }
        );
      } catch (fallbackErr) {
        console.warn('Gamification micro-session fallback failed', fallbackErr);
      }
    }
  }, [buildSessionMistakes]);

  // Enhanced speech recognition
  const { 
    isListening, 
    transcript,
    startListening, 
    stopListening,
    resetTranscript,
    browserSupported,
    error
  } = useSpeechRecognition();

  useEffect(() => {
    isListeningRef.current = isListening;
    if (isListening) {
      const now = Date.now();
      voiceStartRef.current = now;
      speechLastTickRef.current = now;
      speechLastTranscriptChangeRef.current = now;
      speechActiveMsRef.current = 0;
      speechSilenceMsRef.current = 0;
      speechWordCountRef.current = 0;
      pendingVoiceCaptureRef.current = null;
      setLiveWpm(0);
      setLiveWpmLabel('Slow');
      return;
    }
    if (voiceStartRef.current) {
      const totalMs = Math.max(0, Date.now() - voiceStartRef.current);
      const spokenMs = Math.max(0, totalMs - speechSilenceMsRef.current);
      const wpm = spokenMs > 0
        ? Math.round((speechWordCountRef.current / (spokenMs / 60000)) * 10) / 10
        : 0;
      pendingVoiceCaptureRef.current = {
        speechDurationMs: totalMs,
        silenceDurationMs: speechSilenceMsRef.current,
        wordsPerMinute: wpm,
        measuredWords: speechWordCountRef.current,
      };
      setLiveWpm(Math.round(wpm));
      setLiveWpmLabel(getWpmLabel(wpm));
    }
    voiceStartRef.current = 0;
    speechLastTickRef.current = 0;
  }, [isListening]);

  useEffect(() => {
    if (!isListening) return;
    const now = Date.now();
    speechLastTranscriptChangeRef.current = now;
    speechWordCountRef.current = tokenizeNormalized(transcript).length;
  }, [transcript, isListening]);

  useEffect(() => {
    if (!isListening) return undefined;
    const interval = setInterval(() => {
      const now = Date.now();
      const prevTick = speechLastTickRef.current || now;
      const dt = Math.max(0, now - prevTick);
      speechLastTickRef.current = now;
      if (now - speechLastTranscriptChangeRef.current > 650) {
        speechSilenceMsRef.current += dt;
      } else {
        speechActiveMsRef.current += dt;
      }
      const spokenMs = Math.max(0, (now - voiceStartRef.current) - speechSilenceMsRef.current);
      const wpm = spokenMs > 0
        ? (speechWordCountRef.current / (spokenMs / 60000))
        : 0;
      if (now - liveWpmUiTickRef.current > 240) {
        liveWpmUiTickRef.current = now;
        const rounded = Math.max(0, Math.round(wpm));
        setLiveWpm((prev) => (Math.abs(prev - rounded) >= 1 ? rounded : prev));
        setLiveWpmLabel(getWpmLabel(rounded));
      }
    }, 120);
    return () => clearInterval(interval);
  }, [isListening]);

  useEffect(() => {
    return () => {
      stopTts();
      stopListening();
    };
  }, [stopListening]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    retryCountRef.current = retryCount;
  }, [retryCount]);

  // Enhanced auth error handler
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          logout();
          navigate('/login', { 
            state: { 
              message: "Your session has expired. Please log in again." 
            } 
          });
        }
        return Promise.reject(error);
      }
    );
    
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [logout, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopAssistantSpeech = () => {
    stopTts();
  };

  // ElevenLabs TTS via backend — conversational reply text only
  const speakText = useCallback((text) => {
    const charId = isHistoricalMode && selectedCharacter?.id && selectedCharacter.id !== 'emma'
      ? selectedCharacter.id
      : 'emma';
    speakAssistantText(text, {
      audioEnabled,
      apiBaseUrl: API_BASE,
      authHeaders,
      characterId: charId,
      challengeMode: Boolean(selectedCharacter?.challengeMode),
      generationRef: ttsGenerationRef,
      onError: (e) => console.warn('TTS Error:', e?.message || e),
    });
  }, [audioEnabled, isHistoricalMode, selectedCharacter]);

  const addMessage = useCallback((content, type, analysis = null, accentFeedback = null, tutorFeedback = null) => {
    const newMessage = {
      id: Date.now() + Math.random(),
      content,
      type,
      analysis,
      accentFeedback,
      tutorFeedback,
      timestamp: new Date()
    };

    setMessages((prev) => {
      const next = [...prev, newMessage];
      messagesRef.current = next;
      return next;
    });
    return newMessage;
  }, []);

  const runLiveAnalysis = useCallback(async (message, botReply = '', metrics = {}) => {
    const text = String(message || '').trim();
    if (!text) return;
    setIsAnalyzingLive(true);
    try {
      const response = await axios.post(
        '/api/chat/partner/live-analysis',
        {
          message: text,
          bot_reply: String(botReply || ''),
          typingMetrics: metrics.typingMetrics,
          voiceMetrics: metrics.voiceMetrics,
        },
        { timeout: 12000 }
      );
      setLiveAnalysis(response.data || null);
    } catch (err) {
      console.warn('Live analysis unavailable', err);
    } finally {
      setIsAnalyzingLive(false);
    }
  }, []);

  const endChatSession = useCallback(async (optionalMessages) => {
    stopAssistantSpeech();
    stopListening();
    setIsEndingChat(true);
    const msgs = optionalMessages ?? messagesRef.current ?? [];
    if (!Array.isArray(msgs) || msgs.length === 0) {
      setIsEndingChat(false);
      navigate('/stats');
      return;
    }

    const emotionTrend = buildEmotionTrend(msgs);

    try {
      setIsLoading(true);
      const response = await axios.post(
        '/api/chat/partner/end',
        { messages: msgs },
        { timeout: 90000 }
      );
      await syncGamificationForSession(msgs, emotionTrend);
      const elapsedMs = Math.max(0, Date.now() - sessionStartRef.current);
      const mins = Math.floor(elapsedMs / 60000);
      const secs = Math.floor((elapsedMs % 60000) / 1000);
      setSessionSummary({
        summary: response.data.summary,
        improvements: response.data.improvements || [],
        message_count: response.data.message_count,
        duration_label: `${mins}m ${secs}s`,
        emotion_trend: emotionTrend,
      });
      setShowSessionSummary(true);
    } catch (error) {
      console.error('Failed to generate session wrap-up:', error);
      const userMessages = msgs.filter((msg) => msg.type === 'user');
      setSessionSummary({
        summary: `Nice chatting—you sent ${userMessages.length} message${userMessages.length === 1 ? '' : 's'}. Hope to talk again soon.`,
        improvements: ['Come back anytime for another relaxed English chat.'],
        message_count: userMessages.length,
        duration_label: 'Session ended',
        emotion_trend: emotionTrend,
      });
      setShowSessionSummary(true);
    } finally {
      setIsLoading(false);
      setIsEndingChat(false);
    }
  }, [navigate, syncGamificationForSession]);

  const sendMessage = useCallback(async (text, source = 'text') => {
    const trimmed = normalizeUserInputPunctuation(text);
    if (!trimmed) return;

    const endIntent = detectEndIntent(trimmed);
    const wantsEnd = endIntent.confidence >= 0.72;

    stopAssistantSpeech();

    if (wantsEnd) {
      const userMsg = {
        id: Date.now() + Math.random(),
        type: 'user',
        content: trimmed,
        analysis: null,
        accentFeedback: null,
        tutorFeedback: null,
        timestamp: new Date(),
      };
      const next = [...messagesRef.current, userMsg];
      messagesRef.current = next;
      setMessages(next);
      setInputText('');
      await endChatSession(next);
      return;
    }

    addMessage(trimmed, 'user');
    setIsLoading(true);
    setInputText('');
    const sendTs = Date.now();
    const typingDurationMs = typingStartRef.current ? Math.max(0, sendTs - typingStartRef.current) : 0;
    const avgPauseMs = keyPauseCountRef.current > 0 ? Math.round(keyPauseSumRef.current / keyPauseCountRef.current) : 0;
    const typingMetrics = {
      typingStartTs: typingStartRef.current || sendTs,
      sendTs,
      typingDurationMs,
      backspaceCount: backspaceCountRef.current,
      messageLength: trimmed.length,
      avgPauseMs,
    };
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const voiceCapture = source === 'voice' ? pendingVoiceCaptureRef.current : null;
    const speechDurationMs = Number(voiceCapture?.speechDurationMs ?? 0);
    const silenceDurationMs = Number(voiceCapture?.silenceDurationMs ?? 0);
    const computedWpm = Number(voiceCapture?.wordsPerMinute ?? 0);
    const voiceMetrics = {
      speechDurationMs,
      silenceDurationMs,
      wordsPerMinute: computedWpm > 0
        ? computedWpm
        : (speechDurationMs > 0 ? Math.round((words / (Math.max(1, speechDurationMs - silenceDurationMs) / 60000)) * 10) / 10 : 0),
      fillerCount: (trimmed.match(/\b(um|uh|like|actually)\b/gi) || []).length,
    };

    try {
      let botResponse = '';
      const token = getStoredToken();
      if (!token) {
        console.warn('Missing token before stream call; forcing re-login.');
        logout();
        navigate('/login', { state: { message: 'Session missing. Please log in again.' } });
        return;
      }
      const streamResp = await fetch(`${API_BASE || ''}/api/chat/partner/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          typingMetrics,
          voiceMetrics,
          emotionEnabled: true,
          sessionId: activeSessionIdRef.current,
          characterMode: isHistoricalMode && selectedCharacter?.id && selectedCharacter.id !== 'emma',
          characterId: isHistoricalMode ? selectedCharacter?.id : undefined,
          challengeMode: isHistoricalMode ? Boolean(selectedCharacter?.challengeMode) : false,
          personaType: isHistoricalMode ? selectedCharacter?.personaType : 'default',
        }),
      });
      if (streamResp.status === 401) {
        const body = await streamResp.text().catch(() => '');
        console.error('Stream auth failed (401):', body || 'No response body');
        logout();
        navigate('/login', { state: { message: 'Session expired. Please log in again.' } });
        return;
      }
      if (!streamResp.ok || !streamResp.body) {
        const body = await streamResp.text().catch(() => '');
        throw new Error(`Streaming failed: ${streamResp.status} ${body}`);
      }

      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastChatFeedback = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload?.text) {
              botResponse = String(payload.text);
              setStreamingBotText(botResponse);
            }
            if (payload?.final && payload?.response) {
              botResponse = String(payload.response);
              if (payload?.chatFeedback) {
                lastChatFeedback = payload.chatFeedback;
              }
              if (payload?.emotionState) {
                setEmotionState({
                  confidence: Number(payload.emotionState.confidence ?? 0),
                  nervousness: Number(payload.emotionState.nervousness ?? 0),
                  frustration: Number(payload.emotionState.frustration ?? 0),
                  engagement: Number(payload.emotionState.engagement ?? 0),
                });
              }
              if (payload?.activeCharacter?.id) {
                setSelectedCharacter((prev) => ({ ...prev, ...payload.activeCharacter }));
              }
              if (payload?.sessionId) {
                activeSessionIdRef.current = String(payload.sessionId);
              }
            }
          } catch (_) {
            // Ignore malformed chunks.
          }
        }
      }
      setStreamingBotText('');

      if (!botResponse || botResponse.length < 1) {
        throw new Error('Empty reply');
      }

      if (lastChatFeedback) {
        const current = [...messagesRef.current];
        for (let i = current.length - 1; i >= 0; i -= 1) {
          if (current[i].type === 'user') {
            current[i] = { ...current[i], chatFeedback: lastChatFeedback };
            messagesRef.current = current;
            setMessages(current);
            break;
          }
        }
        const corrections = lastChatFeedback?.corrections || [];
        if (corrections.length > 0) {
          axios.post(
            `${GAMIFICATION_BASE}/api/v1/gamification/flashcards/generate`,
            {
              limit: Math.min(3, corrections.length),
              mistakes: corrections.map((c) => ({
                original: c.original,
                corrected: c.corrected,
                type: c.type,
                explanation: c.explanation,
              })),
            },
            { headers: authHeaders(), timeout: 30000 }
          ).catch(() => {});
        }
      }

      addMessage(botResponse, 'bot');
      runLiveAnalysis(trimmed, botResponse, { typingMetrics, voiceMetrics }).catch(() => {});
      setRetryCount(0);

      const nextMsgs = [...messagesRef.current, {
        id: Date.now() + Math.random(),
        type: 'bot',
        content: botResponse,
        timestamp: new Date(),
      }];
      const userTurns = nextMsgs.filter((m) => m.type === 'user').length;
      if (userTurns > 0 && userTurns % 3 === 0) {
        const trend = buildEmotionTrend(nextMsgs);
        syncGamificationForSession(nextMsgs, trend).catch((e) => {
          console.warn('Background gamification sync skipped', e);
        });
      } else {
        axios.post(
          `${GAMIFICATION_BASE}/api/v1/gamification/micro-session`,
          { emotionProfile: { dominant: inferMessageEmotion(trimmed), anxietyFlag: false } },
          { headers: authHeaders(), timeout: 8000 }
        ).catch(() => {});
      }

      setTimeout(() => {
        if (!isListeningRef.current) {
          speakText(botResponse);
        }
      }, 250);
    } catch (error) {
      setStreamingBotText('');
      console.error('Chat error:', error);
      if (
        retryCountRef.current < 2 &&
        (error.code === 'ECONNABORTED' || error.response?.status >= 500)
      ) {
        setRetryCount((c) => c + 1);
        setTimeout(() => sendMessage(trimmed, source), 1500);
      } else {
        let errorMessage = 'Hmm, I glitched for a second—mind sending that again?';
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'That took too long—want to try a shorter line?';
        } else if (error.response?.status === 429) {
          errorMessage = 'Give me a few seconds and try again?';
        }
        addMessage(errorMessage, 'bot');
        setTimeout(() => speakText(errorMessage), 250);
        setRetryCount(0);
      }
    } finally {
      typingStartRef.current = 0;
      lastKeyTsRef.current = 0;
      keyPauseSumRef.current = 0;
      keyPauseCountRef.current = 0;
      backspaceCountRef.current = 0;
      voiceSilenceMsRef.current = 0;
      pendingVoiceCaptureRef.current = null;
      setIsLoading(false);
    }
  }, [addMessage, endChatSession, isHistoricalMode, logout, navigate, runLiveAnalysis, selectedCharacter, speakText, syncGamificationForSession]);

  useEffect(() => {
    if (transcript && !isListening) {
      const cleaned = cleanVoiceTranscript(transcript);
      setInputText(cleaned);
      if (cleaned.trim().length > 2) {
        setTimeout(() => {
          sendMessage(cleaned, 'voice');
        }, 400);
      }
      resetTranscript();
    }
  }, [transcript, isListening, resetTranscript, sendMessage]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputText, 'text');
  };

  const handleVoiceInput = () => {
    if (!browserSupported) {
      showAppToast('Voice input is not supported in this browser. Use a modern browser with microphone access.', 'error');
      return;
    }

    if (isListening) {
      stopAssistantSpeech();
      stopListening();
    } else {
      resetTranscript();
      stopAssistantSpeech();
      startListening();
    }
  };

  const handleCloseSummary = () => {
    stopAssistantSpeech();
    setShowSessionSummary(false);
    setSessionSummary(null);
    setMessages([]);
    messagesRef.current = [];
    sessionStartRef.current = Date.now();
  };

  const handleBackToDashboard = () => {
    stopAssistantSpeech();
    setShowSessionSummary(false);
    setSessionSummary(null);
    navigate('/stats');
  };

  const handleDownloadTranscript = useCallback(() => {
    const lines = messagesRef.current.map((m) => {
      const who = m.type === 'user' ? 'You' : 'Emma';
      const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
      return `[${time}] ${who}: ${m.content}`;
    });
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-transcript-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div
      className={`chat-page partner-chat page-enter ${isHistoricalMode ? 'historical-chat' : ''}`}
      style={isHistoricalMode && selectedCharacter?.ambiance?.accentColor ? { '--character-accent': selectedCharacter.ambiance.accentColor } : undefined}
    >
      <header className="chat-header">
        <div className="chat-header-content">
          <button
            type="button"
            onClick={() => {
              stopAssistantSpeech();
              stopListening();
              navigate('/stats');
            }}
            className="back-button"
          >
            ← Stats
          </button>
          <div className="header-center">
            <h1>{isHistoricalMode ? `Chat with ${selectedCharacter?.name || 'Character'}` : 'Chat with Emma'}</h1>
            <p className="chat-subtitle">Just talk—tips show up when you end the chat.</p>
            <p className="chat-subtitle">
              {isHistoricalMode
                ? `${selectedCharacter?.avatar || '🎭'} ${selectedCharacter?.stylePreview || 'Character tutor style'}`
                : '👩‍🏫 Friendly and balanced tutor style'}
            </p>
            {isHistoricalMode && selectedCharacter?.behaviorProfile?.emotionalTone && (
              <p className="chat-subtitle character-tone-chip">
                Tone: {selectedCharacter.behaviorProfile.emotionalTone}
              </p>
            )}
            {isListening && (
              <span className="listening-badge listening-badge-subtle">
                Listening… speak naturally
              </span>
            )}
            <div className="wpm-live-pill" aria-live="polite">
              <span className="wpm-live-value">{liveWpm}</span>
              <span className="wpm-live-unit">WPM</span>
              <span className={`wpm-live-label ${liveWpmLabel.toLowerCase()}`}>{liveWpmLabel}</span>
            </div>
          </div>
          <div className="header-controls chat-header-controls-compact">
            {isHistoricalMode && (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/characters')}
                  className="btn-ghost chat-icon-btn"
                  title="Switch character"
                  aria-label="Switch character"
                >
                  ↩
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCharacter((prev) => ({ ...prev, challengeMode: !prev?.challengeMode }))}
                  className={`btn-ghost chat-icon-btn ${selectedCharacter?.challengeMode ? 'active' : ''}`}
                  title={selectedCharacter?.challengeMode ? 'Challenge mode on' : 'Challenge mode off'}
                  aria-label="Toggle challenge mode"
                >
                  ⚡
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`btn-ghost chat-icon-btn ${audioEnabled ? 'active' : ''}`}
              title={`Sound ${audioEnabled ? 'on' : 'off'}`}
              aria-label={`Sound ${audioEnabled ? 'on' : 'off'}`}
            >
              {audioEnabled ? '🔊' : '🔇'}
            </button>
            <button
              type="button"
              onClick={() => endChatSession()}
              className="btn-danger end-chat-btn"
              disabled={isLoading || isEndingChat}
              title="End session and see summary"
            >
              End session
            </button>
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="chat-main-layout">
          <div className="chat-main-column">
            <div className="chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`message sw-message-enter ${message.type}`}>
                  <div className="message-content">
                    <p>{message.content}</p>
                  </div>
                  <span className="message-time">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              
              {isLoading && (
                <div className="message bot">
                  <div className="message-content typing-row">
                    {isHistoricalMode && selectedCharacter?.id && selectedCharacter.id !== 'emma' && (
                      <span className="character-typing-avatar" aria-hidden="true">
                        {selectedCharacter?.avatar || '🎭'}
                      </span>
                    )}
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="typing-label">{characterLoadingLine}</span>
                    {retryCount > 0 && (
                      <span className="typing-retry">Retry {retryCount + 1}</span>
                    )}
                  </div>
                </div>
              )}
              {streamingBotText && (
                <div className="message bot">
                  <div className="message-content">
                    <p>{streamingBotText}</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <aside className="chat-analysis-sidebar">
            <div className="chat-analysis-header">
              <h3>Feedback</h3>
              {isAnalyzingLive && <span className="chat-analysis-status">Observing…</span>}
            </div>
            <div className="chat-analysis-content">
              <p className="feedback-disclaimer">
                AI-inferred from your message and speaking behavior — not clinical diagnosis.
              </p>
              {!liveAnalysis ? (
                <p className="chat-analysis-empty">
                  Send a message to see coaching notes here without breaking the conversation flow.
                </p>
              ) : (
                <>
                  <div className="feedback-inference-card">
                    {liveAnalysis.emotion ? (
                      <div className="feedback-emotion-row">
                        <span className="feedback-emotion-label">{capitalizeWord(liveAnalysis.emotion)}</span>
                        <span className="analysis-pill">{formatIntentLabel(liveAnalysis.intent)}</span>
                      </div>
                    ) : null}
                    <p className="chat-analysis-summary">{liveAnalysis.summary}</p>
                    <div className="chat-analysis-meta">
                      {liveAnalysis.responseStyle ? (
                        <span className="analysis-pill">{`Style: ${capitalizeWord(liveAnalysis.responseStyle)}`}</span>
                      ) : null}
                      <span className="analysis-pill">{`Confidence: ${Math.round(Number(liveAnalysis.confidence || 0) * 100)}%`}</span>
                    </div>
                  </div>
                  <div className="analysis-list-block">
                    <h4>Strengths</h4>
                    <ul>
                      {(liveAnalysis.strengths || []).map((item, idx) => <li key={`strength-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="analysis-list-block">
                    <h4>Next improvements</h4>
                    <ul>
                      {(liveAnalysis.improvements || []).map((item, idx) => <li key={`improve-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                  {liveAnalysis.suggested_reply ? (
                    <div className="analysis-list-block">
                      <h4>Suggested next line</h4>
                      <p className="suggested-reply">{liveAnalysis.suggested_reply}</p>
                    </div>
                  ) : null}
                </>
              )}
              <div className="analysis-list-block speaking-signals-block">
                <h4>Speaking signals</h4>
                {[
                  ['Confidence', emotionState?.confidence, 'good'],
                  ['Nervousness', emotionState?.nervousness, (emotionState?.nervousness ?? 0) > 60 ? 'bad' : 'neutral'],
                  ['Frustration', emotionState?.frustration, (emotionState?.frustration ?? 0) > 60 ? 'bad' : 'neutral'],
                  ['Engagement', emotionState?.engagement, (emotionState?.engagement ?? 100) < 40 ? 'bad' : 'good'],
                ].map(([label, value, cls]) => (
                  <div key={label} className="emotion-row">
                    <span>{label}</span>
                    <div className="signal-meter" aria-hidden="true">
                      <div className={`signal-meter-fill ${cls}`} style={{ width: `${typeof value === 'number' ? value : 0}%` }} />
                    </div>
                    <span className={`emotion-pill ${cls}`}>{typeof value === 'number' ? `${value}%` : '--'}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <form onSubmit={handleSubmit} className="chat-input-form">
          <div className="input-group">
            <div className="input-container">
              <textarea
                value={inputText}
                onChange={(e) => {
                  if (!typingStartRef.current) typingStartRef.current = Date.now();
                  const now = Date.now();
                  if (lastKeyTsRef.current) {
                    keyPauseSumRef.current += Math.max(0, now - lastKeyTsRef.current);
                    keyPauseCountRef.current += 1;
                  }
                  lastKeyTsRef.current = now;
                  setInputText(e.target.value);
                }}
                placeholder={isListening ? 'Listening…' : 'Type a message, or use the mic (same as typing)'}
                className="chat-input"
                disabled={isLoading || isEndingChat || showSessionSummary}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace') {
                    backspaceCountRef.current += 1;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              
              {/* Enhanced real-time transcript display */}
              {(isListening || transcript) && (
                <div className="real-time-transcript enhanced">
                  <div className="transcript-label">
                    {isListening ? (
                      <span className="listening-indicator">
                        Listening… <span className="pulse-dot"></span>
                      </span>
                    ) : (
                      <span>Heard:</span>
                    )}
                  </div>
                  <div className="transcript-text">{transcript}</div>
                </div>
              )}
            </div>
            
            {browserSupported && (
              <button
                type="button"
                onClick={handleVoiceInput}
                className={`voice-button enhanced ${isListening ? 'listening' : ''} ${error ? 'error' : ''}`}
                disabled={isLoading || isEndingChat || showSessionSummary}
                title={error ? `Speech: ${error}` : isListening ? 'Stop mic' : 'Use microphone'}
              >
                {isListening ? '🎙️' : '🎤'}
                {isListening && <span className="voice-pulse"></span>}
              </button>
            )}
            
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="send-button"
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
          
          {error && (
            <div className="speech-error enhanced">
              ⚠️ {error}
              <button onClick={resetTranscript} className="error-reset">Try Again</button>
            </div>
          )}
        </form>
      </div>

      {/* FIX #5: Session Summary Modal */}
      {showSessionSummary && sessionSummary && (
        <SessionSummary 
          summary={sessionSummary}
          onClose={handleCloseSummary}
          onBackToDashboard={handleBackToDashboard}
          onDownload={handleDownloadTranscript}
          navigate={navigate}
        />
      )}
    </div>
  );
};

const HistoricalCharactersPage = () => {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState(CHARACTER_LIBRARY);

  useEffect(() => {
    const loadCharacters = async () => {
      try {
        const res = await axios.get('/api/chat/characters');
        const remote = Array.isArray(res.data?.characters) ? res.data.characters : [];
        if (remote.length > 0) {
          setCharacters(remote);
        }
      } catch (_) {
        // keep local fallback
      }
    };
    loadCharacters();
  }, []);

  const startChat = (character) => {
    const selected = {
      id: character.id,
      name: character.name,
      personaType: character.personaType || 'historical',
      description: character.description,
      stylePreview: character.stylePreview || character.style || '',
      avatar: character.avatar || '🎭',
      ttsProfile: character.ttsProfile || undefined,
      ambiance: character.ambiance || undefined,
      behaviorProfile: character.behaviorProfile || undefined,
      challengeMode: false,
    };
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(selected));
    navigate('/chat/character', { state: { selectedCharacter: selected } });
  };

  return (
    <div className="dashboard page-enter">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Speak with Characters</h1>
          <p>Practice English with historical and fictional personas.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => navigate('/stats')}>Back to Dashboard</button>
        </div>
      </header>

      <div className="characters-grid">
        {characters.map((character) => (
          <div
            key={character.id}
            className="character-card"
            style={{ borderTopColor: CHARACTER_ACCENT_COLORS[character.id] || '#2563EB' }}
          >
            <div className="character-avatar">{character.avatar || '🎭'}</div>
            <h3 className="character-name">{character.name}</h3>
            <p className="character-style-tag">{character.stylePreview || character.style || 'Conversation'}</p>
            <p className="character-description">{character.description}</p>
            <button type="button" className="btn-secondary" onClick={() => startChat(character)}>Start session</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Enhanced Profile Page with Manual Level Selection
const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [loading, setLoading] = useState(false);
  const [levelChangeLoading, setLevelChangeLoading] = useState(false);
  const [pendingLevel, setPendingLevel] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const navigate = useNavigate();
  const { updateUserLevel } = useAuth();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const [profileRes, statsRes] = await Promise.all([
          axios.get('/api/user/profile'),
          axios.get('/api/user/stats').catch(() => ({ data: null })),
        ]);
        setProfile(profileRes.data);
        setUserStats(statsRes.data);
        setEditData({
          fullName: profileRes.data.full_name,
          email: profileRes.data.email,
          daily_practice_time: profileRes.data.profile?.goals?.daily_practice_time || 15,
          weekly_vocab_target: profileRes.data.profile?.goals?.weekly_vocab_target || 20,
          correction_style: profileRes.data.profile?.preferences?.correction_style || 'gentle'
        });
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };

    fetchProfile();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      setIsEditing(false);
      showAppToast('Profile updated', 'success');
    } catch (error) {
      console.error('Failed to save profile:', error);
      showAppToast('Could not save profile. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmLevelChange = async () => {
    const newLevel = pendingLevel;
    if (!newLevel) return;
    setLevelChangeLoading(true);
    try {
      const result = await updateUserLevel(newLevel);
      if (result.success) {
        const response = await axios.get('/api/user/profile');
        setProfile(response.data);
        showAppToast(`Level updated to ${newLevel}.`, 'success');
      } else {
        showAppToast(result.error || 'Failed to change level.', 'error');
      }
    } catch (error) {
      showAppToast('Failed to change level. Please try again.', 'error');
    } finally {
      setLevelChangeLoading(false);
      setPendingLevel(null);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 6) {
      showAppToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showAppToast('New passwords do not match.', 'error');
      return;
    }
    setPasswordSaving(true);
    try {
      await axios.post('/api/user/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showAppToast('Password updated successfully.', 'success');
    } catch (err) {
      showAppToast(err?.response?.data?.error || 'Could not change password.', 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading enhanced profile...</p>
      </div>
    );
  }

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const proficiency = profile.profile || {};
  const recentScores = profile.recent_scores || {};
  const levelChangeHistory = profile.level_change_history || [];
  const isAutoLevel = proficiency.preferences?.auto_level_adjustment !== false;
  const awaitingAssessmentProfile = proficiency.awaiting_initial_assessment === true;
  const breakdown = buildProficiencyBreakdown(proficiency, userStats || {});
  const progressSummary = buildProgressSummary(profile, userStats || {}, {});

  return (
    <div className="profile-page page-enter">
      {pendingLevel && (
        <div className="confirm-modal-overlay" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true">
            <h3>Change learning level?</h3>
            <p>{`Switch to ${pendingLevel}? This adjusts your learning experience and disables automatic level adjustments.`}</p>
            <div className="confirm-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setPendingLevel(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={confirmLevelChange} disabled={levelChangeLoading}>
                {levelChangeLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="profile-header">
        <button onClick={() => navigate('/stats')} className="back-button">
          ← Back to Stats
        </button>
        <h1>Your Profile</h1>
      </header>

      <div className="profile-content">
        {/* Personal Information Section */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Personal Information</h2>
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className="btn-secondary"
              disabled={loading}
            >
              {isEditing ? 'Cancel' : 'Edit Profile'}
            </button>
          </div>
          
          <div className="profile-info-grid">
            <div className="info-item">
              <strong>Full Name:</strong>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.fullName}
                  onChange={(e) => setEditData({...editData, fullName: e.target.value})}
                  className="edit-input"
                />
              ) : (
                <span>{profile.full_name}</span>
              )}
            </div>
            
            <div className="info-item">
              <strong>Email:</strong>
              {isEditing ? (
                <input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({...editData, email: e.target.value})}
                  className="edit-input"
                />
              ) : (
                <span>{profile.email}</span>
              )}
            </div>
            
            <div className="info-item">
              <strong>Username:</strong>
              <span className="read-only-field" title="Username cannot be changed">{profile.username}</span>
            </div>
            
            <div className="info-item">
              <strong>Current Level:</strong>
              <span className="level-badge">{proficiency.level || 'Beginner'}</span>
              {!isAutoLevel && <span className="manual-badge">📍 Manual</span>}
            </div>
            
            <div className="info-item">
              <strong>Overall Score:</strong>
              <span className="score-badge">
                {awaitingAssessmentProfile ? 'Not set yet (chat once)' : `${proficiency.proficiency_score ?? 0}%`}
              </span>
            </div>
            
            <div className="info-item">
              <strong>Member Since:</strong>
              <span>{formatDate(profile.created_at)}</span>
            </div>
          </div>

          {isEditing && (
            <div className="edit-actions">
              <button onClick={handleSave} className="btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Enhanced Manual Level Selection */}
        <div className="profile-section">
          <p className="section-label">Level</p>
          <h2>Your Level</h2>
          <div className="level-selection">
            <p>Choose your learning level manually or let Emma adjust automatically based on your performance.</p>
            
            <div className="level-options">
              {['beginner', 'intermediate', 'advanced', 'native'].map(level => (
                <button
                  key={level}
                  onClick={() => setPendingLevel(level)}
                  disabled={levelChangeLoading || proficiency.level === level}
                  className={`level-option ${proficiency.level === level ? 'current' : ''}`}
                >
                  <span className="level-emoji">
                    {level === 'beginner' ? '🌱' : 
                     level === 'intermediate' ? '🌿' : 
                     level === 'advanced' ? '🌳' : '🏆'}
                  </span>
                  <span className="level-name">{level.charAt(0).toUpperCase() + level.slice(1)}</span>
                  {proficiency.level === level && <span className="current-badge">Current</span>}
                </button>
              ))}
            </div>

            {levelChangeHistory.length > 0 && (
              <div className="level-history">
                <h4>📈 Level Change History</h4>
                <div className="history-list">
                  {levelChangeHistory.slice(-3).reverse().map((change, idx) => (
                    <div key={idx} className="history-item">
                      <span className="change-date">{formatDate(change.timestamp)}</span>
                      <span className="change-details">
                        {change.from_level ? `${change.from_level} → ${change.to_level}` : `Set to ${change.to_level}`}
                      </span>
                      <span className={`change-method ${change.method}`}>
                        {change.method === 'manual' ? '📍 Manual' : '🤖 Auto'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {levelChangeLoading && (
              <div className="level-loading">
                <div className="loading-spinner small"></div>
                <span>Updating level...</span>
              </div>
            )}
          </div>
        </div>

        <div className="profile-section">
          <p className="section-label">Skills</p>
          <h2>Proficiency Breakdown</h2>
          {awaitingAssessmentProfile ? (
            <p className="profile-hint">Chat once with Emma to unlock live scores. Demo values shown below.</p>
          ) : null}
          <div className="proficiency-breakdown-grid">
            {breakdown.map((item) => (
              <div className="proficiency-breakdown-card" key={item.key}>
                <div className="proficiency-breakdown-head">
                  <span className="proficiency-breakdown-label">{item.label}</span>
                  <span className="proficiency-breakdown-pct">{item.score}%</span>
                </div>
                <div className="score-bar">
                  <div className={`score-fill skill-bar-${item.key}`}
                    style={{ width: `${item.score}%` }} />
                </div>
                <p className="proficiency-breakdown-tip">{item.tip}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-section">
          <p className="section-label">Progress</p>
          <h2>Detailed Progress Analysis</h2>
          <div className="progress-analysis-grid">
            <div className="progress-analysis-card">
              <h4>Recent quiz performance</h4>
              <p>{progressSummary.quizPerformance}</p>
            </div>
            <div className="progress-analysis-card">
              <h4>Weak areas</h4>
              <p>{progressSummary.weakAreas}</p>
            </div>
            <div className="progress-analysis-card">
              <h4>Pronunciation practice</h4>
              <p>{progressSummary.pronunciationPractice}</p>
            </div>
            <div className="progress-analysis-card highlight">
              <h4>Recommended next action</h4>
              <p>{progressSummary.nextAction}</p>
            </div>
          </div>
          {recentScores && Object.keys(recentScores).length > 0 && (
            <div className="recent-scores-row">
              {Object.entries(recentScores).slice(0, 4).map(([key, val]) => (
                <span key={key} className="analysis-pill">{`${key}: ${val}%`}</span>
              ))}
            </div>
          )}
        </div>

        <div className="profile-section">
          <p className="section-label">Security</p>
          <h2>Change Password</h2>
          <div className="password-form-wrap">
          <form className="password-change-form" onSubmit={handleChangePassword}>
            <label>
              Current password
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={passwordSaving}>
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const LeaderboardPage = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const run = async () => {
      try {
        const res = await axios.get(
          `${GAMIFICATION_BASE}/api/v1/gamification/leaderboard?scope=weekly&persona=diplomat&limit=20`,
          { headers: authHeaders() }
        );
        setEntries(res.data?.entries || []);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const medals = ['🥇', '🥈', '🥉'];
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <div className="dashboard page-enter">
      <header className="dashboard-header">
        <div className="header-content"><h1>Weekly Leaderboard</h1></div>
        <div className="header-actions"><button className="btn-secondary" onClick={() => navigate('/stats')}>Back to Dashboard</button></div>
      </header>
      <div className="leaderboard-page-shell">
        {loading ? (
          <div className="inline-loading centered-loading"><div className="loading-spinner"></div><span>Loading leaderboard...</span></div>
        ) : entries.length === 0 ? (
          <div className="leaderboard-empty">No leaderboard entries yet. Complete a session to appear here.</div>
        ) : (
          <>
            {podium.length > 0 && (
              <div className="leaderboard-podium">
                {podiumOrder.map((e) => (
                  <div key={e.rank} className={`podium-card rank-${e.rank}`}>
                    <span className="podium-medal">{medals[e.rank - 1] || `#${e.rank}`}</span>
                    <div className="podium-name">
                      {e.username}
                      {user?.username === e.username ? <span className="leader-you"> (You)</span> : null}
                    </div>
                    <div className="podium-xp">{e.xpEarned ?? 0} XP · Lv {e.compositeLevel}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="sw-card" style={{ padding: '1rem' }}>
              {rest.map((e) => (
                <div
                  key={`${e.rank}-${e.username}`}
                  className={`leader-row ${user?.username === e.username ? 'is-current-user' : ''}`}
                >
                  <span className="leader-rank">#{e.rank}</span>
                  <span className="leader-name">
                    {e.username}
                    {user?.username === e.username ? <span className="leader-you"> (You)</span> : null}
                  </span>
                  <span className="leader-level">Level {e.compositeLevel}</span>
                </div>
              ))}
              {podium.length > 0 && rest.length === 0 ? (
                <p className="leaderboard-empty" style={{ padding: '1rem 0 0' }}>Top 3 shown above.</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const FLASHCARD_CACHE_KEY = 'sw-flashcards-cache-v2';
const STUDY_DECK_TOTAL = 30;

const STUDY_BADGE_CLASS = {
  Grammar: 'badge-grammar',
  Vocabulary: 'badge-vocabulary',
  Tense: 'badge-tense',
  Correction: 'badge-correction',
  Pronunciation: 'badge-pronunciation',
};

const resolveStudyBadge = (card) => {
  const label = card?.studyCategory
    || (String(card?.errorTag || '').startsWith('study_')
      ? String(card.errorTag).replace('study_', '').replace(/^./, (c) => c.toUpperCase())
      : 'Grammar');
  if (label === 'Pronunciation') return 'Pronunciation';
  if (label === 'Vocabulary') return 'Vocabulary';
  if (label === 'Tense') return 'Tense';
  if (label === 'Correction') return 'Correction';
  return 'Grammar';
};

const FlashcardsPage = () => {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [speakLoading, setSpeakLoading] = useState(false);
  const [deckLoading, setDeckLoading] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const navigate = useNavigate();

  const activeCard = cards[activeIndex] || null;
  const studyBadge = activeCard ? resolveStudyBadge(activeCard) : 'Grammar';
  const isPronunciationCard = studyBadge === 'Pronunciation';
  const cardPosition = completedCount + 1;

  const speakText = useCallback((text) => {
    const content = String(text || '').trim();
    if (!content || speakLoading) return;
    setSpeakLoading(true);
    stopTts();
    speakAssistantText(content, {
      audioEnabled: true,
      apiBaseUrl: API_BASE,
      authHeaders,
      characterId: 'emma',
      challengeMode: false,
      slow: true,
      onDone: () => setSpeakLoading(false),
      onError: () => setSpeakLoading(false),
    });
  }, [speakLoading]);

  const applyDeck = useCallback((incomingCards) => {
    const deck = Array.isArray(incomingCards) ? incomingCards : [];
    setCards(deck);
    setActiveIndex(0);
    setFlipped(false);
    setCompletedCount(0);
    setSessionDone(deck.length === 0);
    setSessionTotal(deck.length || STUDY_DECK_TOTAL);
    try {
      sessionStorage.setItem(FLASHCARD_CACHE_KEY, JSON.stringify(deck));
    } catch (_) { /* ignore */ }
  }, []);

  const loadStudyDeck = useCallback(async ({ background = false, reset = false } = {}) => {
    if (!background) setLoading(true);
    try {
      if (reset) {
        setDeckLoading(true);
        const resetRes = await axios.post(
          `${GAMIFICATION_BASE}/api/v1/gamification/flashcards/reset-demo`,
          {},
          { headers: authHeaders(), timeout: 20000 }
        );
        applyDeck(resetRes.data?.cards || []);
        return;
      }
      const res = await axios.get(
        `${GAMIFICATION_BASE}/api/v1/gamification/flashcards/due/me?limit=${STUDY_DECK_TOTAL}`,
        { headers: authHeaders(), timeout: 15000 }
      );
      applyDeck(res.data?.cards || []);
    } catch (err) {
      showAppToast(err?.response?.data?.error || 'Could not load flashcards.', 'error');
    } finally {
      if (!background) setLoading(false);
      setDeckLoading(false);
    }
  }, [applyDeck]);

  useEffect(() => {
    let usedCache = false;
    try {
      const cached = sessionStorage.getItem(FLASHCARD_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          applyDeck(parsed);
          setLoading(false);
          usedCache = true;
        }
      }
    } catch (_) { /* ignore */ }
    loadStudyDeck({ background: usedCache });
  }, [applyDeck, loadStudyDeck]);

  const advanceAfterReview = useCallback((removedId) => {
    setFlipped(false);
    setCompletedCount((c) => c + 1);
    setCards((prev) => {
      const idx = prev.findIndex((c) => c._id === removedId);
      const next = prev.filter((c) => c._id !== removedId);
      if (!next.length) {
        setActiveIndex(0);
        setSessionDone(true);
      } else if (idx >= next.length) {
        setActiveIndex(next.length - 1);
      }
      return next;
    });
  }, []);

  const review = async (mistakeId, result) => {
    if (reviewSaving) return;
    try {
      setReviewSaving(true);
      await axios.post(
        `${GAMIFICATION_BASE}/api/v1/gamification/flashcards/review`,
        { mistakeId, result },
        { headers: authHeaders(), timeout: 12000 }
      );
      if (result === 'easy') {
        advanceAfterReview(mistakeId);
      } else {
        setFlipped(false);
        setCompletedCount((c) => c + 1);
        setCards((prev) => {
          const idx = prev.findIndex((c) => c._id === mistakeId);
          if (idx < 0) return prev;
          const card = prev[idx];
          const rest = prev.filter((c) => c._id !== mistakeId);
          return [...rest, card];
        });
      }
    } catch (err) {
      showAppToast('Could not save your review. Please try again.', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleFlip = () => {
    if (!flipped && activeCard) setFlipped(true);
  };

  const frontText = activeCard?.cardFront || '';
  const backText = activeCard?.cardBack || activeCard?.correctedForm || '';
  const explanation = activeCard?.cardExplanation || '';
  const hearTarget = isPronunciationCard
    ? (activeCard?.focusWord || activeCard?.correctedForm || backText)
    : '';

  return (
    <div className="flashcards-study-page page-enter">
      <header className="flashcards-study-header">
        <button type="button" className="btn-ghost back-button" onClick={() => navigate('/stats')}>
          ← Back
        </button>
        <h1>Flashcards</h1>
        <button
          type="button"
          className="btn-ghost"
          disabled={deckLoading}
          onClick={() => loadStudyDeck({ reset: true })}
        >
          {deckLoading ? 'Loading…' : 'Restart deck'}
        </button>
      </header>

      <div className="flashcards-study-body">
        {loading ? (
          <div className="flashcards-study-loading">
            <div className="loading-spinner" />
            <span>Loading deck…</span>
          </div>
        ) : sessionDone ? (
          <div className="flashcards-session-complete">
            <div className="flashcards-complete-icon">✓</div>
            <h2>Session complete</h2>
            <p>You reviewed {sessionTotal} cards. Great work.</p>
            <div className="flashcards-complete-actions">
              <button type="button" className="btn-primary" disabled={deckLoading} onClick={() => loadStudyDeck({ reset: true })}>
                Study again
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigate('/stats')}>
                Back to dashboard
              </button>
            </div>
          </div>
        ) : activeCard ? (
          <div className="flashcards-study-stage">
            <div className="flashcards-progress-label">
              {`Card ${Math.min(cardPosition, sessionTotal)} of ${sessionTotal}`}
            </div>
            <div className="flashcards-progress-track" aria-hidden="true">
              <div
                className="flashcards-progress-fill"
                style={{ width: `${Math.min(100, (completedCount / sessionTotal) * 100)}%` }}
              />
            </div>

            <div
              className={`flashcards-flip-scene ${flipped ? 'is-flipped' : ''}`}
              onClick={!flipped ? handleFlip : undefined}
              onKeyDown={(e) => { if (!flipped && (e.key === 'Enter' || e.key === ' ')) handleFlip(); }}
              role="button"
              tabIndex={flipped ? -1 : 0}
              aria-label={flipped ? 'Answer side' : 'Question side — click to flip'}
            >
              <div className="flashcards-flip-inner">
                <div className="flashcards-face flashcards-face-front">
                  <span className={`flashcards-type-badge ${STUDY_BADGE_CLASS[studyBadge] || ''}`}>
                    {studyBadge}
                  </span>
                  <p className="flashcards-face-label">Question</p>
                  <div className="flashcards-face-text">{frontText}</div>
                  {!flipped && (
                    <button
                      type="button"
                      className="flashcards-flip-btn"
                      onClick={(e) => { e.stopPropagation(); handleFlip(); }}
                    >
                      Flip card
                    </button>
                  )}
                </div>

                <div className="flashcards-face flashcards-face-back">
                  <span className={`flashcards-type-badge ${STUDY_BADGE_CLASS[studyBadge] || ''}`}>
                    {studyBadge}
                  </span>
                  <p className="flashcards-face-label">Answer</p>
                  <div className="flashcards-face-text flashcards-answer-text">{backText}</div>
                  {explanation ? (
                    <div className="flashcards-explanation">
                      <span className="flashcards-explanation-label">Explanation</span>
                      <p>{explanation}</p>
                    </div>
                  ) : null}
                  {isPronunciationCard && hearTarget ? (
                    <button
                      type="button"
                      className="flashcards-hear-btn"
                      disabled={speakLoading}
                      onClick={(e) => { e.stopPropagation(); speakText(hearTarget); }}
                    >
                      {speakLoading ? 'Playing…' : 'Hear example 🔊'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {flipped && (
              <div className="flashcards-review-bar">
                <button
                  type="button"
                  className="flashcards-btn-got-it"
                  disabled={reviewSaving}
                  onClick={() => review(activeCard._id, 'easy')}
                >
                  {reviewSaving ? 'Saving…' : '✓ Got it'}
                </button>
                <button
                  type="button"
                  className="flashcards-btn-again"
                  disabled={reviewSaving}
                  onClick={() => review(activeCard._id, 'hard')}
                >
                  ↻ Review again
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">No cards in deck</div>
            <button type="button" className="btn-primary" disabled={deckLoading} onClick={() => loadStudyDeck({ reset: true })}>
              Load study deck
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const QuizPage = () => {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState(0);
  const navigate = useNavigate();

  const quizCacheKey = `sw-quiz-cache-${difficulty}`;

  const loadQuestions = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    setResult(null);
    setAnswers({});
    try {
      const difficultyQuery = difficulty > 0 ? `&difficulty=${difficulty}` : '';
      const res = await axios.get(
        `${GAMIFICATION_BASE}/api/v1/gamification/quiz/questions?quizType=grammar&limit=10${difficultyQuery}`,
        { headers: authHeaders(), timeout: 12000 }
      );
      const nextQuestions = res.data?.questions || [];
      setQuestions(nextQuestions);
      try {
        sessionStorage.setItem(quizCacheKey, JSON.stringify(nextQuestions));
      } catch (_) { /* ignore */ }
    } finally {
      if (!background) setLoading(false);
    }
  }, [difficulty, quizCacheKey]);

  useEffect(() => {
    let hasCache = false;
    try {
      const cached = sessionStorage.getItem(quizCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setQuestions(parsed);
          setLoading(false);
          hasCache = true;
        }
      }
    } catch (_) { /* ignore */ }
    loadQuestions({ background: hasCache });
  }, [loadQuestions, quizCacheKey]);

  const submit = async () => {
    const normalizedAnswers = questions
      .map((q) => {
        const qid = q?.id || q?._id;
        return qid ? { qid, userAnswer: answers[qid] } : null;
      })
      .filter((x) => x && x.userAnswer);

    if (normalizedAnswers.length === 0) {
      showAppToast('Please answer at least one question before submitting.', 'warning');
      return;
    }

    const payload = {
      quizType: 'grammar',
      answers: normalizedAnswers.map((x) => ({ questionId: x.qid, userAnswer: x.userAnswer })),
    };
    try {
      const res = await axios.post(`${GAMIFICATION_BASE}/api/v1/gamification/quiz/submit`, payload, {
        headers: authHeaders(),
      });
      setResult(res.data);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Quiz submission failed';
      console.error('Quiz submit failed:', err?.response?.data || err);
      showAppToast(msg, 'error');
    }
  };

  return (
    <div className="dashboard page-enter">
      <header className="dashboard-header">
        <div className="header-content"><h1>Grammar Quiz</h1></div>
        <div className="header-actions">
          <select
            className="btn-secondary"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            aria-label="Difficulty"
          >
            <option value={0}>All levels</option>
            <option value={1}>Beginner</option>
            <option value={2}>Intermediate</option>
            <option value={3}>Advanced</option>
          </select>
          <button type="button" className="btn-secondary" onClick={() => loadQuestions()}>New quiz</button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/stats')}>Back to Dashboard</button>
        </div>
      </header>
      <div className="quiz-page-shell">
        {loading ? (
          <div className="quiz-skeleton-stack" aria-busy="true" aria-label="Loading quiz">
            {[1, 2, 3].map((n) => (
              <div key={n} className="quiz-card quiz-skeleton-card">
                <div className="skeleton-line skeleton-short" />
                <div className="skeleton-line skeleton-long" />
                <div className="skeleton-line skeleton-mid" />
              </div>
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No questions available</div>
            <div className="empty-state-description">Try again in a moment or pick a different difficulty.</div>
            <button type="button" className="btn-primary" onClick={() => loadQuestions()}>Retry</button>
          </div>
        ) : (
          <>
            {questions.map((q, idx) => {
              const qid = q?.id || q?._id || `${idx}`;
              const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
              return (
                <div className="quiz-card" key={qid}>
                  <div className="quiz-meta-row">
                    <span className="analysis-pill">{q.difficultyLabel || `Level ${q.difficulty || 2}`}</span>
                    <span className="analysis-pill">{q.category || 'grammar'}</span>
                  </div>
                  <p className="quiz-question-text">{`Q${idx + 1}. ${q.questionText}`}</p>
                  <div className="quiz-options">
                    {(q.options || []).map((opt, optIdx) => (
                      <button
                        type="button"
                        key={opt}
                        className={`quiz-option ${answers[qid] === opt ? 'selected' : ''}`}
                        onClick={() => setAnswers((prev) => ({ ...prev, [qid]: opt }))}
                      >
                        <span className="quiz-option-letter">{letters[optIdx] || '?'}</span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!result && (
              <div className="quiz-submit-bar">
                <button type="button" className="btn-primary" onClick={submit}>Submit Quiz</button>
              </div>
            )}
            {result && (
              <div className="quiz-card quiz-result-card score-reveal">
                <div className="quiz-score-display">
                  <div className="quiz-score-number">{result.score}%</div>
                  <div className="quiz-score-label">{`${result.correctCount} correct · ${result.xpAwarded} XP earned`}</div>
                </div>
                {Array.isArray(result.graded) && result.graded.length > 0 && (
                  <div className="quiz-result-list">
                    {result.graded.map((g, idx) => (
                      <div
                        key={`${g.questionId}-${idx}`}
                        className={g.correct ? 'quiz-result-correct' : 'quiz-result-incorrect'}
                      >
                        <div className="quiz-result-question">
                          {`Q${idx + 1}: ${g.questionText || 'Question'}`}
                        </div>
                        <div>{`Your answer: ${g.userAnswer}`}</div>
                        <div>{`Correct answer: ${g.correctAnswer}`}</div>
                        <div className="quiz-result-verdict">{g.correct ? 'Correct' : 'Incorrect'}</div>
                        {!g.correct && g.explanation ? (
                          <div className="quiz-result-explanation">{`Why: ${g.explanation}`}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Main App Component with Enhanced Routing
const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

const App = () => {
  return (
    <ThemeProvider>
      <Router future={routerFutureFlags}>
        <AuthProvider>
          <div className="App">
            <AppToastHost />
            <ThemeToggleFab />
            <Routes>
              <Route path="/" element={<Navigate to="/stats" replace />} />
              <Route path="/home" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/stats" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard" element={<Navigate to="/stats" replace />} />
              <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="/chat/character" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="/characters" element={<ProtectedRoute><HistoricalCharactersPage /></ProtectedRoute>} />
              <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
              <Route path="/quiz" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
              <Route path="/flashcards" element={<ProtectedRoute><FlashcardsPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            </Routes>
          </div>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
};

export default App;
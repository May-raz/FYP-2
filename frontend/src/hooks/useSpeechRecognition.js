import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, getStoredToken } from '../config/api';
import { cleanVoiceTranscript } from '../utils/text';
import { preprocessAudioBlob } from '../utils/speech';

export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [browserSupported, setBrowserSupported] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimerRef = useRef(0);
  const rafRef = useRef(0);
  const retryCountRef = useRef(0);
  const transcribingRef = useRef(false);

  useEffect(() => {
    const hasMediaRecorder = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    setBrowserSupported(Boolean(hasMediaRecorder && hasMediaDevices));
  }, []);

  const clearSilenceWatcher = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceTimerRef.current = 0;
  }, []);

  const stopListening = useCallback(() => {
    clearSilenceWatcher();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, [clearSilenceWatcher]);

  const transcribeAudio = useCallback(async (rawBlob) => {
    if (transcribingRef.current) return;
    transcribingRef.current = true;
    try {
      const processed = await preprocessAudioBlob(rawBlob);
      const token = getStoredToken();
      if (!token) throw new Error('Session expired. Please log in again.');
      const form = new FormData();
      form.append('audio', processed, 'speech.wav');
      form.append('language', 'en');
      const response = await fetch(`${API_BASE}/api/speech/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(body || `Transcription failed (${response.status})`);
      }
      const payload = await response.json();
      const text = cleanVoiceTranscript(String(payload?.text ?? ''));
      if (!text) throw new Error('No speech detected. Please speak clearly and try again.');
      setTranscript(text);
      setError(null);
      retryCountRef.current = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Voice transcription failed';
      if (retryCountRef.current < 1) {
        retryCountRef.current += 1;
        setError('Retrying voice transcription...');
        setTimeout(() => { transcribeAudio(rawBlob).catch(() => {}); }, 450);
      } else {
        setError(message);
      }
    } finally {
      transcribingRef.current = false;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!browserSupported) {
      setError('Voice capture is not supported in this browser.');
      return;
    }
    if (isListening) return;
    try {
      setError(null);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 },
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined,
        audioBitsPerSecond: 128000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('Microphone capture failed. Please try again.');
        setIsListening(false);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size < 256) {
          setError('No speech detected. Please try again.');
          return;
        }
        transcribeAudio(blob).catch(() => {});
      };
      recorder.start(300);
      mediaRecorderRef.current = recorder;
      setIsListening(true);

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize);
      const silenceWindowMs = 1600;
      const silenceFloor = 0.018;
      let lastSpeechTs = Date.now();
      const poll = () => {
        if (!analyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
        analyserRef.current.getByteTimeDomainData(samples);
        let sumSq = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const v = (samples[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / samples.length);
        const now = Date.now();
        if (rms > silenceFloor) lastSpeechTs = now;
        else if (now - lastSpeechTs > silenceWindowMs) {
          stopListening();
          return;
        }
        rafRef.current = requestAnimationFrame(poll);
      };
      rafRef.current = requestAnimationFrame(poll);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to access microphone');
      setIsListening(false);
    }
  }, [browserSupported, isListening, stopListening, transcribeAudio]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
    retryCountRef.current = 0;
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, transcript, startListening, stopListening, resetTranscript, browserSupported, error };
}

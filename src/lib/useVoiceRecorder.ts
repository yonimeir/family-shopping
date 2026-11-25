import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logVoice } from './voiceLog';

export type RecorderMode = 'audio' | 'speech';

interface SpeechRecLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecEventLike {
  results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }>;
}

function getSpeechRecCtor(): (new () => SpeechRecLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecLike;
    webkitSpeechRecognition?: new () => SpeechRecLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

export function isSpeechRecognitionAvailable(): boolean {
  return Boolean(getSpeechRecCtor());
}

/**
 * Unified mobile voice recorder:
 * - `'audio'` captures compressed audio (`MediaRecorder`) + live waveform (`AnalyserNode`) for Gemini/OpenAI.
 * - `'speech'` captures Hebrew transcript via Web Speech API + optional mic waveform for Claude.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const modeRef = useRef<RecorderMode>('audio');
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<SpeechRecLike | null>(null);
  const finalTranscriptRef = useRef('');
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const activeRef = useRef(false);
  const sessionIdRef = useRef(0);

  const cleanupResources = useCallback(() => {
    sessionIdRef.current += 1;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      speechRecRef.current?.abort();
    } catch {
      /* ignore */
    }
    speechRecRef.current = null;

    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try {
        mediaRecRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    activeRef.current = false;
    setRecording(false);
  }, []);

  useEffect(() => cleanupResources, [cleanupResources]);

  const attachAnalyser = (stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      /* waveform degrades gracefully to ambient pulse */
    }
  };

  const start = useCallback(
    async (mode: RecorderMode): Promise<boolean> => {
      cleanupResources();
      const mySession = sessionIdRef.current;
      const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia);
      const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
      const pickedMime = mode === 'audio' ? pickAudioMimeType() : '';
      logVoice('rec:start', 'התחלת הקלטה', { mode, hasMediaDevices, hasMediaRecorder, pickedMime });

      setError(null);
      setLiveTranscript('');
      setElapsedMs(0);
      finalTranscriptRef.current = '';
      chunksRef.current = [];
      modeRef.current = mode;

      if (mode === 'speech') {
        const Ctor = getSpeechRecCtor();
        if (!Ctor) {
          logVoice('rec:error', 'זיהוי דיבור מובנה לא נתמך בדפדפן', { mode }, 'error');
          setError('זיהוי דיבור מובנה לא נתמך בדפדפן הזה — עברו ל־Gemini או הקלידו למטה.');
          return false;
        }
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (sessionIdRef.current !== mySession) {
              micStream.getTracks().forEach((t) => t.stop());
              return false;
            }
            streamRef.current = micStream;
            attachAnalyser(micStream);
          }
        } catch {
          /* SpeechRecognition handles mic permission directly */
        }
        if (sessionIdRef.current !== mySession) return false;
        try {
          const rec = new Ctor();
          rec.lang = 'he-IL';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (ev) => {
            let text = '';
            for (let i = 0; i < ev.results.length; i++) {
              text += ev.results[i]?.[0]?.transcript || '';
            }
            const clean = text.trim();
            finalTranscriptRef.current = clean;
            setLiveTranscript(clean);
          };
          rec.onerror = (ev) => {
            logVoice('rec:error', 'שגיאת זיהוי דיבור', { error: ev.error }, 'error');
            if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
              setError('אין הרשאת מיקרופון בדפדפן.');
            }
          };
          rec.start();
          speechRecRef.current = rec;
          startedAtRef.current = Date.now();
          activeRef.current = true;
          setRecording(true);
          logVoice('rec:active', 'הקלטת דיבור פעילה', { mode: 'speech', lang: rec.lang });
          timerRef.current = window.setInterval(() => {
            setElapsedMs(Date.now() - startedAtRef.current);
          }, 120);
          return true;
        } catch (err) {
          cleanupResources();
          logVoice('rec:error', 'כשל בהפעלת זיהוי דיבור', err, 'error');
          setError('לא ניתן להפעיל זיהוי דיבור כרגע — הקלידו בתיבת הטקסט.');
          return false;
        }
      }

      if (!hasMediaDevices || !hasMediaRecorder) {
        logVoice('rec:error', 'הקלטת מיקרופון אינה נתמכת במכשיר', { hasMediaDevices, hasMediaRecorder }, 'error');
        setError('הקלטת מיקרופון אינה נתמכת במכשיר זה.');
        return false;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });
        if (sessionIdRef.current !== mySession) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
        streamRef.current = stream;
        attachAnalyser(stream);

        const rec = pickedMime ? new MediaRecorder(stream, { mimeType: pickedMime }) : new MediaRecorder(stream);
        rec.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        rec.start(150);
        mediaRecRef.current = rec;
        startedAtRef.current = Date.now();
        activeRef.current = true;
        setRecording(true);
        logVoice('rec:active', 'הקלטת שמע פעילה', { mode: 'audio', mimeType: rec.mimeType || pickedMime || 'default' });
        timerRef.current = window.setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current);
        }, 120);
        return true;
      } catch (err) {
        cleanupResources();
        const name = err instanceof Error ? err.name : '';
        logVoice('rec:error', 'כשל בפתיחת מיקרופון', { name, msg: err instanceof Error ? err.message : String(err) }, 'error');
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('יש לאשר גישה למיקרופון בהגדרות הדפדפן.');
        } else {
          setError('לא הצלחתי לפתוח את המיקרופון.');
        }
        return false;
      }
    },
    [cleanupResources]
  );

  const stop = useCallback(async (): Promise<{ audio?: Blob; transcript?: string }> => {
    if (!activeRef.current) {
      logVoice('rec:stop', 'עצירה כשלא פעילה הקלטה', { mode: modeRef.current }, 'warn');
      return {};
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (modeRef.current === 'speech') {
      const rec = speechRecRef.current;
      if (rec) {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          rec.onend = finish;
          try {
            rec.stop();
          } catch {
            finish();
          }
          window.setTimeout(finish, 350);
        });
      }
      const transcript = finalTranscriptRef.current.trim();
      logVoice('rec:stop', 'הקלטת דיבור נעצרה', { mode: 'speech', transcriptLen: transcript.length });
      cleanupResources();
      return { transcript };
    }

    const rec = mediaRecRef.current;
    if (!rec) {
      logVoice('rec:stop', 'חסר אובייקט MediaRecorder בעצירה', { mode: 'audio' }, 'warn');
      cleanupResources();
      return {};
    }

    const blob = await new Promise<Blob>((resolve) => {
      const fallbackMime = rec.mimeType || 'audio/webm';
      let done = false;
      const finalize = () => {
        if (done) return;
        done = true;
        resolve(new Blob(chunksRef.current, { type: fallbackMime }));
      };
      rec.onstop = finalize;
      if (rec.state === 'inactive') {
        finalize();
        return;
      }
      try {
        if (rec.state === 'recording' && typeof rec.requestData === 'function') {
          rec.requestData();
        }
      } catch {
        /* ignore requestData unsupported */
      }
      try {
        rec.stop();
      } catch {
        finalize();
      }
      window.setTimeout(finalize, 600);
    });

    const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    logVoice('rec:stop', 'הקלטת שמע נעצרה', {
      mode: 'audio',
      chunks: chunksRef.current.length,
      bytes: blob.size,
      mime: blob.type,
      elapsedMs,
    });
    cleanupResources();
    return { audio: blob };
  }, [cleanupResources]);

  const cancel = useCallback(() => {
    if (activeRef.current) {
      logVoice('rec:cancel', 'ההקלטה בוטלה', { mode: modeRef.current }, 'warn');
    }
    chunksRef.current = [];
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    setElapsedMs(0);
    setError(null);
    cleanupResources();
  }, [cleanupResources]);

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({
      recording,
      elapsedMs,
      liveTranscript,
      error,
      analyserRef,
      start,
      stop,
      cancel,
      clearError,
    }),
    [recording, elapsedMs, liveTranscript, error, start, stop, cancel, clearError]
  );
}

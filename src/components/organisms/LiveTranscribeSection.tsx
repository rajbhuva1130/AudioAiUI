import React, { useEffect, useRef, useState } from 'react';
import Button from '../atoms/Button';
import Icon from '../atoms/Icon';
import LoadingSpinner from '../atoms/LoadingSpinner';
import ErrorMessage from '../atoms/ErrorMessage';
import { DEFAULT_LANGUAGES } from '../../config/env';
import { LiveTranscribeClient } from '../../services/ws/livetranscribe';
import { useTranscription } from '../../context/useTranscription';

const LiveTranscribeSection: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state, dispatch } = useTranscription();
  const [language, setLanguage] = useState(state.language);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const clientRef = useRef<LiveTranscribeClient | null>(null);
  const sessionRef = useRef<string | undefined>(undefined);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // (Re)initialize client when language changes
    clientRef.current?.disconnect();
    sessionRef.current = undefined;
    setText('');
    const client = new LiveTranscribeClient({
      language,
      onMessage: (msg) => {
        if (disconnectTimeoutRef.current) {
          clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = null;
        }

        if (msg.type === 'error' && msg.text) {
          setError(msg.text);
          return;
        }

        setIsConnecting(false);

        if (msg.sessionId && sessionRef.current !== msg.sessionId) {
          sessionRef.current = msg.sessionId;
          dispatch({ type: 'add_session', payload: { id: msg.sessionId, language, createdAt: Date.now() } });
          dispatch({ type: 'set_current', payload: msg.sessionId });
          setText('');
        }

        if (msg.type === 'session_end' && msg.text) {
          setText(msg.text);
        } else if (msg.type === 'final' && msg.text) {
          setText((prev) => (prev ? `${prev}\n${msg.text}` : msg.text));
        } else if (msg.type === 'partial' && msg.text) {
          setText(msg.text);
        }

        if ((msg.type === 'final' || msg.type === 'session_end') && msg.text && msg.sessionId) {
          dispatch({ type: 'update_transcript', payload: { id: msg.sessionId, transcript: msg.text } });
        }
      },
      onError: (err) => setError(err.message),
      });
      clientRef.current = client;
      return () => {
        clientRef.current?.disconnect();
        if (disconnectTimeoutRef.current) {
          clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = null;
        }
      };
    }, [language, dispatch]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      mediaRecorderRef.current?.stop();
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    setIsConnecting(true);
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }
    try {
      clientRef.current?.connect(language);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick a compatible MIME type across browsers
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac'
      ];
      const supported = preferredTypes.find((t) => {
        if (typeof MediaRecorder === 'undefined') return false;
        const mr = MediaRecorder as unknown as { isTypeSupported?: (type: string) => boolean };
        return typeof mr.isTypeSupported === 'function' ? mr.isTypeSupported(t) : false;
      });
      const mr = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          clientRef.current?.sendAudioChunk(e.data);
        }
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start(500);
      setIsRecording(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Microphone access failed';
      setError(message);
      clientRef.current?.disconnect();
    } finally {
      setIsConnecting(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clientRef.current?.requestStop();
    disconnectTimeoutRef.current = setTimeout(() => {
      clientRef.current?.disconnect();
    }, 2000);
    setIsRecording(false);
  };

  return (
    <section className={`bg-gray-800 rounded-xl p-4 sm:p-6 ${className}`} aria-label="Real-time translation">
      <h2 className="text-xl font-semibold text-white mb-4">Real-time Translation</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="language-toggle" className="text-gray-300">Language</label>
            <select
              id="language-toggle"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-3 py-2"
              aria-label="Select live transcription language"
            >
              {DEFAULT_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {isRecording ? (
            <Button variant="secondary" onClick={stopRecording} className="flex items-center gap-2">
              <Icon name="microphone" size={20} aria-hidden /> Stop
            </Button>
          ) : (
            <Button variant="primary" onClick={startRecording} className="flex items-center gap-2">
              <Icon name="microphone" size={20} aria-hidden /> Start
            </Button>
          )}
        </div>

        {isConnecting && (
          <LoadingSpinner size="md" text="Connecting to live transcription..." />
        )}

        {error && (
          <ErrorMessage message={error} onDismiss={() => setError(null)} />
        )}

        <div className="bg-gray-900 rounded-lg p-4 text-gray-300 leading-relaxed min-h-[120px]">
          <h3 className="text-lg font-semibold text-white mb-2">Live Text</h3>
          <div role="log" aria-live="polite" aria-relevant="additions text" className="max-h-[240px] overflow-y-auto whitespace-pre-wrap" tabIndex={0}>
            {text || 'Speak into your microphone to see real-time results.'}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LiveTranscribeSection;

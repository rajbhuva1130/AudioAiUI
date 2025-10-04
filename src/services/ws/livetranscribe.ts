import { WS_BASE_URL, API_TOKEN } from '../../config/env';
import type { LiveTranscribeMessage, LiveTranscribeMessageType } from '../../types/api';

type ServerMessage = {
  type?: string;
  text?: string;
  session_id?: string;
  sessionId?: string;
  final_text?: string;
  download_url?: string;
  downloadUrl?: string;
  segments?: Array<Record<string, unknown>>;
  language?: string;
  [key: string]: unknown;
};

const VALID_TYPES: Set<LiveTranscribeMessageType> = new Set([
  'session_start',
  'session_end',
  'partial',
  'final',
  'translation',
  'error',
  'info',
]);

const normalizeServerMessage = (
  data: ServerMessage,
  fallbackSessionId?: string,
): LiveTranscribeMessage => {
  const rawType = typeof data.type === 'string' ? (data.type as string) : 'info';
  const normalizedType = VALID_TYPES.has(rawType as LiveTranscribeMessageType)
    ? (rawType as LiveTranscribeMessageType)
    : 'info';

  const sessionId = (data.sessionId ?? data.session_id ?? fallbackSessionId) as string | undefined;
  const text = (data.text ?? data.final_text) as string | undefined;
  const downloadUrl = (data.downloadUrl ?? data.download_url) as string | undefined;
  const segments = Array.isArray(data.segments) ? (data.segments as Array<Record<string, unknown>>) : undefined;

  return {
    type: normalizedType,
    text,
    language: typeof data.language === 'string' ? data.language : undefined,
    sessionId,
    downloadUrl,
    segments,
    raw: data,
  };
};

type MessageHandler = (msg: LiveTranscribeMessage) => void;
type ErrorHandler = (err: Error) => void;

export class LiveTranscribeClient {
  private ws?: WebSocket;
  private onMessage?: MessageHandler;
  private onError?: ErrorHandler;
  private language: string = 'English';
  private sessionId?: string;

  constructor(opts?: { onMessage?: MessageHandler; onError?: ErrorHandler; language?: string }) {
    this.onMessage = opts?.onMessage;
    this.onError = opts?.onError;
    if (opts?.language) this.language = opts.language;
  }

  connect(language?: string) {
    if (language) this.language = language;
    this.sessionId = undefined;
    const tokenQuery = API_TOKEN ? `&token=${encodeURIComponent(API_TOKEN)}` : '';
    const url = `${WS_BASE_URL}/live-transcribe?lang=${encodeURIComponent(this.language)}${tokenQuery}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      // Inform server of language/session if needed
      this.sendJSON({ type: 'info', language: this.language });
    };

    this.ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as ServerMessage;
        const normalized = normalizeServerMessage(parsed, this.sessionId);
        if (normalized.sessionId) this.sessionId = normalized.sessionId;
        this.onMessage?.(normalized);
      } catch {
        // fallback: treat as text message
        this.onMessage?.({
          type: 'partial',
          text: String(ev.data),
          language: this.language,
          sessionId: this.sessionId,
        });
      }
    };

    this.ws.onerror = () => {
      const err = new Error('WebSocket error');
      this.onError?.(err);
    };

    this.ws.onclose = () => {
      this.ws = undefined;
      this.sessionId = undefined;
    };
  }

  disconnect() {
    if (this.ws && this.ws.readyState <= 1) this.ws.close();
    this.ws = undefined;
    this.sessionId = undefined;
  }

  sendAudioChunk(chunk: ArrayBuffer | Blob) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (chunk instanceof Blob) {
      chunk.arrayBuffer().then((ab) => this.ws?.send(ab));
      return;
    }
    this.ws.send(chunk);
  }

  sendJSON(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  getSessionId() {
    return this.sessionId;
  }

  requestStop() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ text: 'stop' }));
  }
}

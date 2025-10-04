export type LanguageCode = string;

export interface FileTranscribeResponse {
  sessionId: string;
  transcript: string;
  translation?: string;
  status?: 'processing' | 'done' | 'error';
}

export type LiveTranscribeMessageType =
  | 'session_start'
  | 'session_end'
  | 'partial'
  | 'final'
  | 'translation'
  | 'error'
  | 'info';

export interface LiveTranscribeMessage {
  type: LiveTranscribeMessageType;
  text?: string;
  language?: LanguageCode;
  sessionId?: string;
  segments?: Array<Record<string, unknown>>;
  downloadUrl?: string;
  raw?: unknown;
}

export type DownloadFormat = 'txt' | 'srt' | 'json';

export interface SessionRecord {
  id: string;
  language: LanguageCode;
  createdAt: number;
  transcript?: string;
  translation?: string;
}
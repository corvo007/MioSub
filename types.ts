export interface SubtitleItem {
  id: number;
  startTime: string; // Format: HH:MM:SS,ms
  endTime: string;   // Format: HH:MM:SS,ms
  original: string;
  translated: string;
}

export interface HistoryItem {
  id: string;
  fileName: string;
  date: string;
  subtitles: SubtitleItem[];
}

export enum GenerationStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  PROOFREADING = 'proofreading',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export type OutputFormat = 'srt' | 'ass';

// Gemini Response Schema Helper Types
export interface GeminiSubtitleSchema {
  start: string; // Expecting "MM:SS" or "HH:MM:SS" or "SS.ms"
  end: string;
  text_original: string;
  text_translated: string;
}
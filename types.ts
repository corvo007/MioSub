
export interface SubtitleItem {
  id: number;
  startTime: string; // Format: HH:MM:SS,ms
  endTime: string;   // Format: HH:MM:SS,ms
  original: string;
  translated: string;
  comment?: string; // User comment for specific correction
}

export interface SubtitleSnapshot {
  id: string;
  timestamp: string;
  description: string;
  subtitles: SubtitleItem[];
  batchComments: Record<number, string>; // Store batch comments with snapshot
}

export enum GenerationStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  PROOFREADING = 'proofreading',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface ChunkStatus {
  id: number | string;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  stage?: 'transcribing' | 'refining' | 'translating';
  message?: string;
}

export type OutputFormat = 'srt' | 'ass';

export type BatchOperationMode = 'fix_timestamps' | 'retranslate' | 'proofread';

// Settings Types
export const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
export type Genre = 'general' | 'anime' | 'movie' | 'news' | 'tech';

export interface AppSettings {
  geminiKey: string;
  openaiKey: string;
  transcriptionModel: string; // 'whisper-1' | 'gpt-4o-audio-preview'
  genre: string; // Changed from Genre to string to support custom input
  customTranslationPrompt: string;
  customProofreadingPrompt: string;
  outputMode: 'bilingual' | 'target_only';
  proofreadBatchSize: number;
  translationBatchSize: number;
  chunkDuration: number;
  concurrencyFlash: number;
  concurrencyPro: number;
}

// Gemini Response Schema Helper Types
export interface GeminiSubtitleSchema {
  start: string; // Expecting "MM:SS" or "HH:MM:SS" or "SS.ms"
  end: string;
  text_original?: string;
  text_translated?: string;
  text?: string; // For transcription-only phase
}

export interface OpenAIWhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}
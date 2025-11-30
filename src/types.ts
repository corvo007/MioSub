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
  stage?: 'transcribing' | 'waiting_glossary' | 'refining' | 'translating';
  message?: string;
  toast?: {
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
  };
}

export type OutputFormat = 'srt' | 'ass' | 'json';

export type BatchOperationMode = 'fix_timestamps' | 'proofread';

// Settings Types
export const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
export type Genre = 'general' | 'anime' | 'movie' | 'news' | 'tech';

export interface GlossaryItem {
  term: string;
  translation: string;
  notes?: string;
}

// Multi-Glossary Support
export interface Glossary {
  id: string;              // UUID
  name: string;            // User-defined name
  terms: GlossaryItem[];   // Terms list
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}

export interface GlossaryStorage {
  glossaries: Glossary[];
  activeGlossaryId: string | null;
}

export interface GlossaryExtractionResult {
  terms: GlossaryItem[];
  source: 'chunk' | 'full';
  chunkIndex?: number;
  confidence?: 'high' | 'medium' | 'low';
}

export interface GlossaryExtractionMetadata {
  results: GlossaryExtractionResult[];
  totalTerms: number;
  hasFailures: boolean;
  glossaryChunks?: { index: number; start: number; end: number }[];
}

export interface AppSettings {
  geminiKey: string;
  openaiKey: string;
  openaiEndpoint?: string;
  geminiEndpoint?: string;
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

  useSmartSplit?: boolean;
  glossary?: GlossaryItem[]; // Deprecated, used for migration
  glossaries?: Glossary[];
  activeGlossaryId?: string;
  // Glossary Extraction Settings
  enableAutoGlossary?: boolean;           // Default: true
  glossarySampleMinutes?: number | 'all'; // Default: 'all', or max minutes to analyze
  glossaryAutoConfirm?: boolean;          // Default: false (show dialog)
  requestTimeout?: number;                // Default: 600 (seconds)
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
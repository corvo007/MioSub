import { GlossaryItem, Glossary } from '@/types/glossary';

export const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
export type Genre = 'general' | 'anime' | 'movie' | 'news' | 'tech';

export const GENRE_LABELS: Record<string, string> = {
  general: '通用',
  anime: '动漫',
  movie: '电影/剧集',
  news: '新闻',
  tech: '科技',
};

export interface DebugSettings {
  mockGemini: boolean;
  mockOpenAI: boolean;
  mockLocalWhisper: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  whisperPath?: string;
}

export interface AppSettings {
  debug?: DebugSettings;
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
  enableAutoGlossary?: boolean; // Default: true
  glossarySampleMinutes?: number | 'all'; // Default: 'all', or max minutes to analyze
  glossaryAutoConfirm?: boolean; // Default: false (show dialog)
  requestTimeout?: number; // Default: 600 (seconds)

  // Local Whisper Settings
  useLocalWhisper?: boolean; // Whether to use local Whisper
  whisperModelPath?: string; // Model file path (.bin)
  whisperThreads?: number; // Number of threads (default: 4)
  whisperConcurrency?: number; // Max concurrent processes (default: 1)

  // Speaker Diarization Settings
  enableDiarization?: boolean; // Enable speaker identification (default: false)
  includeSpeakerInExport?: boolean; // Include speaker names in exported subtitles (default: false)
  useSpeakerColors?: boolean; // Apply different colors for each speaker in ASS export (default: false)
  useSpeakerStyledTranslation?: boolean; // Use speaker characteristics to guide translation style (default: false)
  minSpeakers?: number; // Minimum expected speaker count (optional hint for LLM)
  maxSpeakers?: number; // Maximum expected speaker count (optional hint for LLM)
  enableSpeakerPreAnalysis?: boolean; // Perform an initial pass to analyze speakers (quality improvement)

  // Batch Operation Settings
  conservativeBatchMode?: boolean; // Conservative mode for fix_timestamps/proofread (default: false)
  zoomLevel?: number; // UI Zoom level (0.5 - 2.0)
}

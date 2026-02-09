import { type GlossaryItem, type Glossary } from '@/types/glossary';

export const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
export type Genre = 'general' | 'anime' | 'movie' | 'news' | 'tech';

// Translation keys for genres
export const GENRE_KEYS: Record<string, string> = {
  general: 'genre.general',
  anime: 'genre.anime',
  movie: 'genre.movie',
  news: 'genre.news',
  tech: 'genre.tech',
};

export interface DebugSettings {
  // Mock Stage: Use mock data for selected stage
  mockStage?: 'transcribe' | 'refinement' | 'alignment' | 'translation';
  mockDataPath?: string; // Path to JSON/SRT file (optional, falls back to preset)
  // Skip After: Stop pipeline after this stage
  skipAfter?: 'transcribe' | 'refinement' | 'alignment';
  mockLanguage?: string; // Language for alignment (ISO 639-3)
  // Mock API: Skip actual API calls and pass-through/echo data
  mockApi?: {
    transcribe?: boolean;
    refinement?: boolean;
    alignment?: boolean; // Skip CTC alignment
    translation?: boolean;
    glossary?: boolean; // Skip/Mock glossary extraction
    speaker?: boolean; // Skip/Mock speaker analysis (pre-analysis)
  };
  // Custom paths
  ffmpegPath?: string;
  ffprobePath?: string;
  saveIntermediateArtifacts?: boolean;
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
  customRefinementPrompt?: string; // User hints for transcription/refinement step
  customProofreadingPrompt: string;
  outputMode: 'bilingual' | 'target_only';
  targetLanguage?: string; // Target language for translation (default: 'Simplified Chinese')
  proofreadBatchSize: number;
  translationBatchSize: number;
  chunkDuration: number;
  concurrencyFlash: number;
  concurrencyPro: number;

  useSmartSplit?: boolean;
  /**
   * Runtime-only: Active glossary terms for current operation.
   * NOT persisted - use glossaries + activeGlossaryId instead.
   * This field is populated at runtime when passing settings through the pipeline.
   */
  glossary?: GlossaryItem[];
  glossaries?: Glossary[];
  activeGlossaryId?: string | null;
  // Glossary Extraction Settings
  enableAutoGlossary?: boolean; // Default: true
  glossarySampleMinutes?: number | 'all'; // Default: 'all', or max minutes to analyze
  glossaryAutoConfirm?: boolean; // Default: false (show dialog)
  requestTimeout?: number; // Default: 600 (seconds)

  // Local Whisper Settings
  useLocalWhisper?: boolean; // Whether to use local Whisper
  whisperModelPath?: string; // Model file path (.bin)
  localWhisperBinaryPath?: string; // Whisper executable path (whisper-cli.exe)

  // Speaker Diarization Settings
  enableDiarization?: boolean; // Enable speaker identification (default: false)
  includeSpeakerInExport?: boolean; // Include speaker names in exported subtitles (default: false)
  useSpeakerColors?: boolean; // Apply different colors for each speaker in ASS export (default: false)
  useSpeakerStyledTranslation?: boolean; // Use speaker characteristics to guide translation style (default: false)
  minSpeakers?: number; // Minimum expected speaker count (optional hint for LLM)
  maxSpeakers?: number; // Maximum expected speaker count (optional hint for LLM)
  enableSpeakerPreAnalysis?: boolean; // Perform an initial pass to analyze speakers (quality improvement)

  // Batch Operation Settings

  zoomLevel?: number; // UI Zoom level (0.5 - 2.0)

  // Alignment Settings
  alignmentMode?: 'ctc' | 'none'; // Timestamp alignment strategy (default: 'none')
  alignerPath?: string; // Path to align.exe (CTC forced aligner)
  alignmentModelPath?: string; // Path to MMS alignment model directory
  localConcurrency?: number; // Max concurrent local processes (default: 1)

  // Text Processing Settings
  removeTrailingPunctuation?: boolean; // Remove trailing punctuation from subtitles (default: false)

  // Display Settings
  language?: 'zh-CN' | 'en-US' | 'ja-JP'; // UI language (default: auto-detect from system)

  // Multi-Provider Settings
  stepProviders?: {
    refinement?: {
      type: 'gemini' | 'openai' | 'claude';
      apiKey: string;
      baseUrl?: string;
      model: string;
    };
    translation?: {
      type: 'gemini' | 'openai' | 'claude';
      apiKey: string;
      baseUrl?: string;
      model: string;
    };
    proofread?: {
      type: 'gemini' | 'openai' | 'claude';
      apiKey: string;
      baseUrl?: string;
      model: string;
    };
    speakerExtraction?: {
      type: 'gemini' | 'openai' | 'claude';
      apiKey: string;
      baseUrl?: string;
      model: string;
    };
    glossaryExtraction?: {
      type: 'gemini' | 'openai' | 'claude';
      apiKey: string;
      baseUrl?: string;
      model: string;
    };
  };
  providerCapabilities?: Record<string, { jsonMode: string; probedAt: number }>;
}

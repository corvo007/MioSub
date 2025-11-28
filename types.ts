
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

export type BatchOperationMode = 'fix_timestamps' | 'proofread';

// Settings Types
export const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
export type Genre = 'general' | 'anime' | 'movie' | 'news' | 'tech';

export interface GlossaryItem {
  term: string;
  translation: string;
  notes?: string;
}

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
  qualityControl?: QualityControlConfig;
  useSmartSplit?: boolean;
  glossary?: GlossaryItem[];
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

// --- Agentic Pipeline Types ---

export interface ModelConfig {
  provider: 'gemini' | 'openai';
  modelName: string;
  tier?: 'flash' | 'pro' | 'high';
  temperature?: number;
  maxTokens?: number;
}

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface SubtitleIssue {
  id: string;
  type: 'timing_misalignment' | 'missing_content' | 'incorrect_translation' | 'sync_error' | 'other';
  segmentIndex: number;
  segmentId?: number; // Original subtitle ID
  timestamp: string;
  description: string;
  severity: IssueSeverity;
  roundIdentified: number;
}

export interface IssueTracker {
  issueId: string;
  originalIssue: SubtitleIssue;
  status: 'new' | 'fixed' | 'unfixed' | 'partially_fixed';
  history: {
    roundNumber: number;
    action: 'identified' | 'attempted_fix' | 'validated';
    result: string;
    timestamp: number;
  }[];
}

export interface QualityControlConfig {
  reviewModel: ModelConfig;
  fixModel: ModelConfig;
  validateModel: ModelConfig;
  maxIterations: number;
  acceptanceCriteria: {
    maxHighSeverityIssues: number;
    maxMediumLowIssuesPerMinute: number;
  };
  audioCacheEnabled: boolean;
}

export const DEFAULT_QC_CONFIG: QualityControlConfig = {
  reviewModel: {
    provider: 'gemini',
    modelName: 'gemini-3-pro-preview',
    tier: 'high',
    temperature: 1.0,
    maxTokens: 65536,
  },
  fixModel: {
    provider: 'gemini',
    modelName: 'gemini-3-pro-preview',
    tier: 'high',
    temperature: 1.0,
    maxTokens: 65536,
  },
  validateModel: {
    provider: 'gemini',
    modelName: 'gemini-3-pro-preview',
    tier: 'high',
    temperature: 1.0,
    maxTokens: 65536,
  },
  maxIterations: 2,
  acceptanceCriteria: {
    maxHighSeverityIssues: 0,
    maxMediumLowIssuesPerMinute: 1,
  },
  audioCacheEnabled: true,
};

// OpenAI Model Configurations

export const DEFAULT_QC_CONFIG_GPT_5_1: QualityControlConfig = {
  reviewModel: {
    provider: 'openai',
    modelName: 'gpt-5.1',
    tier: 'high',
    temperature: 1.0,
    maxTokens: 65536,
  },
  fixModel: {
    provider: 'openai',
    modelName: 'gpt-5.1',
    tier: 'high',
    temperature: 1.0,
    maxTokens: 65536,
  },
  validateModel: {
    provider: 'openai',
    modelName: 'gpt-5.1',
    tier: 'high',
    temperature: 1.0,
    maxTokens: 65536,
  },
  maxIterations: 2,
  acceptanceCriteria: {
    maxHighSeverityIssues: 0,
    maxMediumLowIssuesPerMinute: 1,
  },
  audioCacheEnabled: true,
};

export const DEFAULT_QC_CONFIG_GPT_5_PRO: QualityControlConfig = {
  reviewModel: {
    provider: 'openai',
    modelName: 'gpt-5-pro',
    tier: 'pro',
    temperature: 1.0,
    maxTokens: 65536,
  },
  fixModel: {
    provider: 'openai',
    modelName: 'gpt-5-pro',
    tier: 'pro',
    temperature: 1.0,
    maxTokens: 65536,
  },
  validateModel: {
    provider: 'openai',
    modelName: 'gpt-5-pro',
    tier: 'pro',
    temperature: 1.0,
    maxTokens: 65536,
  },
  maxIterations: 2,
  acceptanceCriteria: {
    maxHighSeverityIssues: 0,
    maxMediumLowIssuesPerMinute: 1,
  },
  audioCacheEnabled: true,
};

export const DEFAULT_QC_CONFIG_GPT_4O: QualityControlConfig = {
  reviewModel: {
    provider: 'openai',
    modelName: 'gpt-4o',
    tier: 'flash',
    temperature: 1.0,
    maxTokens: 16384,
  },
  fixModel: {
    provider: 'openai',
    modelName: 'gpt-4o',
    tier: 'flash',
    temperature: 1.0,
    maxTokens: 16384,
  },
  validateModel: {
    provider: 'openai',
    modelName: 'gpt-4o',
    tier: 'flash',
    temperature: 1.0,
    maxTokens: 16384,
  },
  maxIterations: 2,
  acceptanceCriteria: {
    maxHighSeverityIssues: 0,
    maxMediumLowIssuesPerMinute: 1,
  },
  audioCacheEnabled: true,
};
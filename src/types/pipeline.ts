import { type GoogleGenAI } from '@google/genai';
import { type TokenUsage } from '@/types/api';
import { type SubtitleItem } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type GlossaryItem, type GlossaryExtractionResult } from '@/types/glossary';
import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import { type ChunkStatus } from '@/types/api';
import { type VideoInfo } from '@/types/artifact';

// Re-export common types for convenience
export type {
  GlossaryItem,
  GlossaryExtractionResult,
  SpeakerProfile,
  SubtitleItem,
  AppSettings,
  ChunkStatus,
  VideoInfo,
};

// Shared Context for Pipeline Stages
export interface PipelineContext {
  ai: GoogleGenAI;
  settings: AppSettings;
  signal?: AbortSignal;
  trackUsage: (usage: TokenUsage) => void;
  onProgress?: (update: ChunkStatus) => void;
  isDebug: boolean;
  geminiKey: string;
  openaiKey?: string;
  /** Video information for artifact metadata */
  videoInfo?: VideoInfo;
}

// Context for Chunk Processing
export interface ChunkContext extends PipelineContext {
  chunkIndex: number;
  totalChunks: number;
  start: number;
  end: number;
  audioBuffer: AudioBuffer;
}

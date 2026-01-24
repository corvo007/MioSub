export type SubtitleIssueType =
  | 'duration'
  | 'length'
  | 'overlap'
  | 'confidence'
  | 'regression'
  | 'corrupted';

import { type SpeakerUIProfile } from './speaker';

export interface SubtitleItem {
  id: string;
  startTime: string; // Format: HH:MM:SS,ms
  endTime: string; // Format: HH:MM:SS,ms
  original: string;
  translated: string;
  speakerId?: string; // Foreign Key: Link to SpeakerProfile
  speaker?: string; // Cache: Display name
  comment?: string; // User comment for specific correction
  // Timeline validation markers (from refinement step)
  hasRegressionIssue?: boolean; // startTime went backwards significantly
  hasCorruptedRangeIssue?: boolean; // Part of a corrupted timeline range
  // Alignment confidence markers (from CTC alignment step)
  alignmentScore?: number; // 0.0 - 1.0 confidence score from CTC aligner
  lowConfidence?: boolean; // true if alignmentScore < 0.7
}

export interface SubtitleSnapshot {
  id: string;
  timestamp: string;
  description: string;
  subtitles: SubtitleItem[];
  batchComments: Record<string, string>; // Store batch comments with snapshot
  fileId: string; // File path or unique identifier for grouping
  fileName: string; // Display name of the file
  speakerProfiles?: SpeakerUIProfile[]; // Speaker profiles with custom colors
}

export type OutputFormat = 'srt' | 'ass' | 'json';

export type BatchOperationMode = 'regenerate' | 'proofread';

/**
 * User-provided hints for the regenerate operation
 */
export interface RegeneratePrompts {
  transcriptionHint?: string; // Injected into refinement prompt
  translationHint?: string; // Injected into translation prompt
}

// Gemini Response Schema Helper Types
export interface GeminiSubtitleSchema {
  start: string; // Expecting "MM:SS" or "HH:MM:SS" or "SS.ms"
  end: string;
  text_original?: string;
  text_translated?: string;
  text?: string; // For transcription-only phase
  speaker?: string; // Speaker identifier from diarization
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

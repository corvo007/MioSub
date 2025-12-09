export interface SubtitleItem {
  id: string;
  startTime: string; // Format: HH:MM:SS,ms
  endTime: string; // Format: HH:MM:SS,ms
  original: string;
  translated: string;
  comment?: string; // User comment for specific correction
  speaker?: string; // Speaker identifier (e.g., "Speaker 1", "Speaker 2")
}

export interface SubtitleSnapshot {
  id: string;
  timestamp: string;
  description: string;
  subtitles: SubtitleItem[];
  batchComments: Record<string, string>; // Store batch comments with snapshot
  fileId: string; // File path or unique identifier for grouping
  fileName: string; // Display name of the file
}

export type OutputFormat = 'srt' | 'ass' | 'json';

export type BatchOperationMode = 'fix_timestamps' | 'proofread';

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

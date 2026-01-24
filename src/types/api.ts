export enum GenerationStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  PROOFREADING = 'proofreading',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

export interface ChunkStatus {
  id: number | string;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  stage?:
    | 'transcribing'
    | 'waiting_glossary'
    | 'waiting_speakers'
    | 'refining'
    | 'aligning'
    | 'translating'
    | 'proofing'
    | 'waiting_refinement';
  message?: string;
  toast?: {
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
  };
  analytics?: ChunkAnalytics;
}

/** Step status in analytics */
export type StepResultStatus = 'success' | 'failed' | 'cancelled' | 'skipped' | 'mocked';

/** Analytics data for a single chunk's processing */
export interface ChunkAnalytics {
  /** Chunk index (0-based) */
  index: number;
  /** Transcription: duration in ms */
  transcribe_ms?: number;
  /** Transcription: step status */
  transcribe_status?: StepResultStatus;
  /** Refinement: duration in ms */
  refine_ms?: number;
  /** Refinement: step status */
  refine_status?: StepResultStatus;
  /** Alignment: duration in ms */
  align_ms?: number;
  /** Alignment: step status */
  align_status?: StepResultStatus;
  /** Translation: duration in ms */
  translate_ms?: number;
  /** Translation: step status */
  translate_status?: StepResultStatus;
  /** Overall chunk status */
  status: 'success' | 'failed' | 'cancelled' | 'empty' | 'skipped';
  /** Duration of the audio chunk in ms */
  duration_ms?: number;
}

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  modelName: string;
  // Detailed breakdown by modality
  textInputTokens?: number;
  audioInputTokens?: number;
  thoughtsTokens?: number;
  cachedTokens?: number;
}

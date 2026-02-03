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
export type AnalyticsStepStatus =
  | 'not_started'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'mocked';

export interface StepAnalytics {
  status: AnalyticsStepStatus;
  duration_ms: number;
}

/** Analytics data for a single chunk's processing */
export interface ChunkAnalytics {
  /** Chunk index (0-based) */
  index: number;
  /** Overall chunk status */
  status: 'not_started' | 'processing' | 'success' | 'failed' | 'cancelled' | 'empty' | 'skipped';
  /** Duration of the audio chunk in ms (audio length) */
  duration_ms: number;
  /** Total wall-clock time spent processing this chunk in ms */
  process_ms: number;
  /** Whether the failure was due to a user-actionable error (auth, quota, billing) */
  isUserActionable?: boolean;
  /** Error message when status is 'failed' */
  errorMessage?: string;

  /** Structured analytics for each processing step */
  steps: {
    transcription: StepAnalytics;
    refinement: StepAnalytics;
    alignment: StepAnalytics;
    translation: StepAnalytics;
  };
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

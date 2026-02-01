/**
 * Pipeline Core Types
 */

import { type Semaphore } from '@/services/utils/concurrency';
import { type ChunkParams } from '@/services/generation/pipeline/preprocessor';
import { type PipelineContext, type SpeakerProfile } from '@/types/pipeline';
import { type SubtitleItem } from '@/types/subtitle';
import { type GlossaryItem } from '@/types/glossary';
import { type GlossaryState } from '@/services/generation/extractors/glossaryState';
import { type PostCheckResult } from '@/services/subtitle/postCheck';
import { type ChunkAnalytics } from '@/types/api';

export type StepName =
  | 'transcribe'
  | 'waitDeps'
  | 'refinement'
  | 'alignment'
  | 'translation'
  | 'proofread';

/** Status of a step execution */
export type StepStatus = 'success' | 'failed' | 'cancelled' | 'skipped' | 'mocked';

export interface StepResult<T> {
  output: T;
  /** Step execution status */
  status: StepStatus;
  /** Duration of this step execution in milliseconds (always set, even on cancel/error) */
  durationMs: number;
  /** @deprecated Use status === 'skipped' instead */
  skipped?: boolean;
  /** @deprecated Use status === 'mocked' instead */
  mocked?: boolean;
  /** Error that occurred (if status === 'failed') */
  error?: Error;
}

export interface ChunkDependencies {
  glossaryState: GlossaryState;
  speakerProfilePromise: Promise<SpeakerProfile[]> | null;
  transcriptionSemaphore: Semaphore;
  refinementSemaphore: Semaphore;
  alignmentSemaphore: Semaphore;
  audioBuffer: AudioBuffer | null; // null for long videos (on-demand extraction)
  videoPath?: string; // Required for long videos (on-demand extraction)
  isLongVideo: boolean; // Flag to indicate long video mode
  chunkDuration: number;
  totalChunks: number;
  /** Temporary storage for chunk analytics (set during processing) */
  chunkAnalytics?: ChunkAnalytics;
}

export interface StepContext {
  // Chunk info
  chunk: ChunkParams;
  chunkDuration: number;
  totalChunks: number;

  // Pipeline context
  pipelineContext: PipelineContext;

  // Dependencies
  deps: ChunkDependencies;

  // Shared mutable state between steps
  glossary?: GlossaryItem[];
  speakerProfiles?: SpeakerProfile[];
  base64Audio?: string;
  rawSegments?: SubtitleItem[]; // Raw segments before refinement (for reconciliation)

  // Mock stage helpers
  mockStageIndex: number;
  mockInputSegments: SubtitleItem[];
}

export { type PostCheckResult };

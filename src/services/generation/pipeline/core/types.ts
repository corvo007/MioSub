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

export type StepName = 'transcribe' | 'waitDeps' | 'refinement' | 'alignment' | 'translation';

export interface StepResult<T> {
  output: T;
  skipped?: boolean;
  mocked?: boolean;
  error?: Error;
}

export interface ChunkDependencies {
  glossaryState: GlossaryState;
  speakerProfilePromise: Promise<SpeakerProfile[]> | null;
  transcriptionSemaphore: Semaphore;
  refinementSemaphore: Semaphore;
  alignmentSemaphore: Semaphore;
  audioBuffer: AudioBuffer;
  chunkDuration: number;
  totalChunks: number;
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

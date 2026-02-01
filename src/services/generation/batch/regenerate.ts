/**
 * Regenerate - Re-runs the full pipeline for selected batches
 *
 * Pipeline: Transcription → Refinement → Alignment → Translation
 * - Skips Glossary/SpeakerProfile extraction (reuses existing)
 * - Supports auto-chunking for large time ranges
 * - Uses shared pipeline initialization from pipelineCore
 */

import i18n from '@/i18n';
import { type SubtitleItem, type RegeneratePrompts } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import { type SpeakerProfile } from '@/types/pipeline';
import { type GlossaryItem } from '@/types/glossary';
import { type ChunkParams } from '@/services/generation/pipeline/preprocessor';
import { type ChunkDependencies } from '@/services/generation/pipeline/core/types';
import { ChunkProcessor, type ChunkResult } from '@/services/generation/pipeline/chunkProcessor';
import {
  initializePipelineContext,
  calculateMainLoopConcurrency,
} from '@/services/generation/pipeline/pipelineCore';
import { mapInParallel } from '@/services/utils/concurrency';
import { decodeAudio } from '@/services/audio/decoder';
import { timeToSeconds, formatTime } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';
import { GlossaryState } from '@/services/generation/extractors/glossaryState';
import { generateSubtitleId } from '@/services/utils/id';

/**
 * Calculate time range from batch indices
 */
export function calculateTimeRange(
  subtitles: SubtitleItem[],
  batchIndices: number[],
  batchSize: number
): { start: number; end: number } {
  if (batchIndices.length === 0 || subtitles.length === 0) {
    return { start: 0, end: 0 };
  }

  const sortedIndices = [...batchIndices].sort((a, b) => a - b);
  const firstBatch = sortedIndices[0];
  const lastBatch = sortedIndices[sortedIndices.length - 1];

  const firstSubIndex = firstBatch * batchSize;
  const lastSubIndex = Math.min((lastBatch + 1) * batchSize - 1, subtitles.length - 1);

  if (firstSubIndex >= subtitles.length) {
    return { start: 0, end: 0 };
  }

  return {
    start: timeToSeconds(subtitles[firstSubIndex].startTime),
    end: timeToSeconds(subtitles[lastSubIndex].endTime),
  };
}

/**
 * Create chunks for a time range, auto-splitting if needed
 */
export function createChunksForRange(
  timeRange: { start: number; end: number },
  chunkDuration: number
): ChunkParams[] {
  const duration = timeRange.end - timeRange.start;

  // Single chunk if within duration
  if (duration <= chunkDuration) {
    return [{ index: 1, start: timeRange.start, end: timeRange.end }];
  }

  // Split into multiple chunks
  const chunks: ChunkParams[] = [];
  let cursor = timeRange.start;
  let index = 1;

  while (cursor < timeRange.end) {
    chunks.push({
      index: index++,
      start: cursor,
      end: Math.min(cursor + chunkDuration, timeRange.end),
    });
    cursor += chunkDuration;
  }

  return chunks;
}

/**
 * Merge results from multiple chunks into a single array
 */
function mergeChunkResults(results: ChunkResult[]): SubtitleItem[] {
  const merged: SubtitleItem[] = [];
  for (const result of results) {
    merged.push(...result.final);
  }
  return merged;
}

/**
 * Assign new random IDs to subtitles (consistent with main pipeline)
 */
function assignNewIds(subtitles: SubtitleItem[]): SubtitleItem[] {
  return subtitles.map((sub) => ({
    ...sub,
    id: generateSubtitleId(),
  }));
}

/**
 * Merge regenerated subtitles back into original array
 *
 * The new subtitles replace the selected range, with new random IDs
 * to maintain consistency with the main pipeline's ID generation.
 */
export function mergeResults(
  original: SubtitleItem[],
  batchIndices: number[],
  newSubtitles: SubtitleItem[],
  batchSize: number
): SubtitleItem[] {
  if (batchIndices.length === 0 || newSubtitles.length === 0) {
    return original;
  }

  const sortedIndices = [...batchIndices].sort((a, b) => a - b);
  const firstIndex = sortedIndices[0] * batchSize;
  const lastIndex = Math.min(
    (sortedIndices[sortedIndices.length - 1] + 1) * batchSize,
    original.length
  );

  // Assign new random IDs to regenerated subtitles
  const withNewIds = assignNewIds(newSubtitles);

  // Replace the range
  const result = [...original];
  result.splice(firstIndex, lastIndex - firstIndex, ...withNewIds);

  return result;
}

/**
 * Run regenerate operation for selected batches
 */
export async function runRegenerateOperation(
  file: File,
  subtitles: SubtitleItem[],
  batchIndices: number[],
  settings: AppSettings,
  prompts: RegeneratePrompts,
  speakerProfiles?: SpeakerProfile[],
  glossary?: GlossaryItem[],
  onProgress?: (update: ChunkStatus) => void,
  signal?: AbortSignal
): Promise<SubtitleItem[]> {
  const batchSize = settings.proofreadBatchSize || 20;

  // Calculate time range
  const timeRange = calculateTimeRange(subtitles, batchIndices, batchSize);
  if (timeRange.start >= timeRange.end) {
    logger.warn('Invalid time range for regeneration');
    return subtitles;
  }

  logger.info(
    `[Regenerate] Time range: ${formatTime(timeRange.start)} - ${formatTime(timeRange.end)}`
  );

  // Create chunks
  const chunkDuration = settings.chunkDuration || 300;
  const chunks = createChunksForRange(timeRange, chunkDuration);
  logger.info(`[Regenerate] Created ${chunks.length} chunks`);

  // Decode audio
  onProgress?.({
    id: 'init',
    total: chunks.length,
    status: 'processing',
    message: i18n.t('services:pipeline.status.loadingAudio'),
  });

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudio(file);

    // Update init status to completed
    onProgress?.({
      id: 'init',
      total: chunks.length,
      status: 'completed',
      message: i18n.t('services:pipeline.status.audioLoaded'),
    });
  } catch (e) {
    logger.error('Failed to decode audio for regeneration', e);
    throw new Error(i18n.t('services:pipeline.errors.decodeFailed'));
  }

  // Build settings with user hints injected
  const settingsWithHints: AppSettings = {
    ...settings,
    // Inject user hints into custom prompts
    // transcriptionHint -> affects refinement step (transcription correction)
    customRefinementPrompt: prompts.transcriptionHint
      ? `${settings.customRefinementPrompt || ''}\n${prompts.transcriptionHint}`.trim()
      : settings.customRefinementPrompt,
    // translationHint -> affects translation step
    customTranslationPrompt: prompts.translationHint
      ? `${settings.customTranslationPrompt || ''}\n${prompts.translationHint}`.trim()
      : settings.customTranslationPrompt,
  };

  // Create wrapped onProgress that maps chunk IDs to regenerate-prefixed IDs
  // This prevents duplicate progress entries since ChunkProcessor also calls onProgress
  const wrappedOnProgress = onProgress
    ? (update: ChunkStatus) => {
        const mappedId = typeof update.id === 'number' ? `regenerate-${update.id}` : update.id;
        onProgress({ ...update, id: mappedId });
      }
    : undefined;

  // Initialize pipeline context using shared core
  const {
    context: pipelineContext,
    usageReporter,
    semaphores,
    concurrency,
  } = initializePipelineContext({
    settings: settingsWithHints,
    onProgress: wrappedOnProgress,
    signal,
  });

  // Create glossary state with existing glossary (wrap in resolved Promise)
  const glossaryState = new GlossaryState(Promise.resolve(glossary || []));

  // Create dependencies
  const deps: ChunkDependencies = {
    glossaryState,
    speakerProfilePromise: speakerProfiles ? Promise.resolve(speakerProfiles) : null,
    transcriptionSemaphore: semaphores.transcription,
    refinementSemaphore: semaphores.refinement,
    alignmentSemaphore: semaphores.alignment,
    audioBuffer,
    isLongVideo: false, // Regeneration always uses in-memory AudioBuffer
    chunkDuration,
    totalChunks: chunks.length,
  };

  // Process chunks in parallel with proper concurrency limits
  const results: ChunkResult[] = [];
  const mainLoopConcurrency = calculateMainLoopConcurrency(chunks.length, concurrency.pipeline);

  await mapInParallel(
    chunks,
    mainLoopConcurrency,
    async (chunk, i) => {
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      // ChunkProcessor.process will call wrappedOnProgress internally,
      // which maps chunk.index to regenerate-${chunk.index}
      const result = await ChunkProcessor.process(chunk, pipelineContext, deps);
      results[i] = result;
    },
    signal
  );

  // Merge results
  const regeneratedSubtitles = mergeChunkResults(results);
  logger.info(`[Regenerate] Generated ${regeneratedSubtitles.length} subtitles`);

  // Log usage
  usageReporter.logReport();

  // Merge back into original
  return mergeResults(subtitles, batchIndices, regeneratedSubtitles, batchSize);
}

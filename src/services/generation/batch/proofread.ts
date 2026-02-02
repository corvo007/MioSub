/**
 * Batch Operations - Proofread operation for existing subtitles
 *
 * Refactored to use ProofreadStep from the pipeline framework.
 * Uses shared infrastructure: initializePipelineContext, UsageReporter, Semaphore.
 */

import i18n from '@/i18n';
import { type SubtitleItem, type BatchOperationMode } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import { decodeAudio } from '@/services/audio/decoder';
import { isLongVideo, LONG_VIDEO_THRESHOLD } from '@/services/audio/segmentExtractor';
import { mapInParallel } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import { formatTime } from '@/services/subtitle/time';
import { getSystemInstructionWithDiarization } from '@/services/llm/prompts';
import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { PROOFREAD_BATCH_SIZE } from '@/services/llm/schemas';
import { initializePipelineContext } from '@/services/generation/pipeline/pipelineCore';
import {
  ProofreadStep,
  type ProofreadContext,
} from '@/services/generation/pipeline/steps/ProofreadStep';

// ============================================================================
// Main Entry Point
// ============================================================================

export const runProofreadOperation = async (
  file: File | null,
  allSubtitles: SubtitleItem[],
  batchIndices: number[], // 0-based indices of chunks
  settings: AppSettings,
  mode: BatchOperationMode,
  batchComments: Record<string, string> = {}, // Pass map of batch index -> comment
  onProgress?: (update: ChunkStatus) => void,
  signal?: AbortSignal,
  speakerProfiles?: SpeakerProfile[],
  videoPath?: string, // Optional video path for long video on-demand extraction
  totalVideoDuration?: number // Optional total video duration (for long video detection)
): Promise<SubtitleItem[]> => {
  // ===== Initialize Pipeline Context =====
  // Use shared initialization (skip OpenAI since proofread doesn't need it)
  const { context, usageReporter, semaphores, concurrency } = initializePipelineContext({
    settings,
    onProgress,
    signal,
    skipOpenAI: true, // Proofread uses only Gemini
  });

  // ===== Check for Long Video Mode =====
  const isLongVideoMode = !!(videoPath && totalVideoDuration && isLongVideo(totalVideoDuration));

  // ===== Decode Audio =====
  let audioBuffer: AudioBuffer | null = null;
  let audioDuration: number | undefined = totalVideoDuration;

  if (isLongVideoMode) {
    // Long video mode: skip audio decoding, use on-demand extraction
    logger.info(
      `Long video detected (${formatTime(totalVideoDuration!)} > ${formatTime(LONG_VIDEO_THRESHOLD)}). Using on-demand segment extraction for proofread.`
    );
    onProgress?.({
      id: 'init',
      total: 0,
      status: 'completed',
      message: i18n.t('services:pipeline.status.longVideoMode', {
        duration: formatTime(totalVideoDuration!),
      }),
    });
  } else if (file) {
    onProgress?.({
      id: 'init',
      total: 0,
      status: 'processing',
      message: i18n.t('services:pipeline.status.loadingAudio'),
    });
    try {
      audioBuffer = await decodeAudio(file);
      audioDuration = audioBuffer.duration;

      // Update init status to completed
      onProgress?.({
        id: 'init',
        total: 0,
        status: 'completed',
        message: i18n.t('services:pipeline.status.audioLoaded'),
      });
    } catch (e) {
      logger.warn('Audio decode failed, proceeding with text-only mode.', e);
    }
  } else {
    logger.info('No media file provided, running in text-only context.');
  }

  // ===== Generate System Instruction =====
  const systemInstruction = getSystemInstructionWithDiarization(
    settings.genre,
    settings.customProofreadingPrompt,
    'proofread',
    getActiveGlossaryTerms(settings),
    settings.enableDiarization,
    speakerProfiles,
    settings.minSpeakers,
    settings.maxSpeakers,
    settings.targetLanguage
  );

  // ===== Split Subtitles into Batches =====
  const currentSubtitles = [...allSubtitles];
  const chunks: SubtitleItem[][] = [];
  const batchSize = settings.proofreadBatchSize || PROOFREAD_BATCH_SIZE;
  for (let i = 0; i < currentSubtitles.length; i += batchSize) {
    chunks.push(currentSubtitles.slice(i, i + batchSize));
  }

  // ===== Group Consecutive Batch Indices =====
  const sortedIndices = [...batchIndices].sort((a, b) => a - b);
  const groups: number[][] = [];

  // If ALL batches selected, process individually (avoid huge prompt)
  const isSelectAll = sortedIndices.length === chunks.length;

  if (sortedIndices.length > 0) {
    if (isSelectAll) {
      sortedIndices.forEach((idx) => groups.push([idx]));
    } else {
      // Group consecutive indices
      let currentGroup = [sortedIndices[0]];
      for (let i = 1; i < sortedIndices.length; i++) {
        if (sortedIndices[i] === sortedIndices[i - 1] + 1) {
          currentGroup.push(sortedIndices[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [sortedIndices[i]];
        }
      }
      groups.push(currentGroup);
    }
  }

  // ===== Create ProofreadStep Instance =====
  const proofreadStep = new ProofreadStep();

  // ===== Determine Concurrency =====
  // Proofread uses Gemini Pro (low RPM) -> use concurrencyPro
  const batchConcurrency =
    mode === 'proofread' ? settings.concurrencyPro || 2 : concurrency.pipeline;

  // ===== Pre-calculate index ranges for each group =====
  // This avoids race conditions when parallel batches modify the array
  interface GroupRange {
    group: number[];
    startIndex: number; // Original array start index
    endIndex: number; // Original array end index (inclusive)
  }

  const groupRanges: GroupRange[] = groups.map((group) => {
    const firstBatchIdx = group[0];
    const lastBatchIdx = group[group.length - 1];
    const startIndex = firstBatchIdx * batchSize;
    const endIndex = Math.min((lastBatchIdx + 1) * batchSize - 1, allSubtitles.length - 1);
    return { group, startIndex, endIndex };
  });

  // Store results by group index to merge later
  const resultsByGroup: Map<number, SubtitleItem[]> = new Map();

  // ===== Process Batches in Parallel =====
  await mapInParallel(
    groupRanges,
    batchConcurrency,
    async (groupRange, i) => {
      const { group, startIndex, endIndex } = groupRange;
      const firstBatchIdx = group[0];

      // Merge batches in the group using slice from original array
      const mergedBatch = allSubtitles.slice(startIndex, endIndex + 1);
      let mergedComment = '';

      group.forEach((idx) => {
        if (idx < chunks.length && batchComments[idx]) {
          const batch = chunks[idx];
          if (batch.length > 0) {
            const rangeLabel = `[IDs ${batch[0].id}-${batch[batch.length - 1].id}]`;
            mergedComment += (mergedComment ? ' | ' : '') + `${rangeLabel}: ${batchComments[idx]}`;
          }
        }
      });

      // Create batch label for logging
      const groupLabel =
        group.length > 1
          ? `${group[0] + 1}-${group[group.length - 1] + 1}`
          : `${firstBatchIdx + 1}`;

      logger.debug(
        `[Batch ${groupLabel}] Starting ${mode} operation. Merged items: ${mergedBatch.length}`
      );

      // Create ProofreadContext
      const proofreadCtx: ProofreadContext = {
        pipelineContext: context,
        semaphore: semaphores.refinement, // Use refinement semaphore (Pro model)
        audioBuffer,
        videoPath: isLongVideoMode ? videoPath : undefined,
        isLongVideo: isLongVideoMode,
        totalVideoDuration: audioDuration,
        batchLabel: groupLabel,
        totalBatches: groups.length,
        batchIndex: i,
      };

      // Run ProofreadStep
      const { output, error } = await proofreadStep.run(
        {
          batch: mergedBatch,
          batchComment: mergedComment || undefined,
          speakerProfiles,
          systemInstruction,
        },
        proofreadCtx
      );

      if (error) {
        // Step already logged and reported progress, just re-throw if fatal
        throw error;
      }

      // Store result for later merging
      resultsByGroup.set(i, output);

      logger.debug(
        `[Batch ${groupLabel}] Processed ${mergedBatch.length} items -> ${output.length} output items`
      );
    },
    signal
  );

  // ===== Merge Results Back (Sequential) =====
  // Process groups in reverse order to maintain index validity when splicing
  const sortedGroupIndices = Array.from(resultsByGroup.keys()).sort((a, b) => b - a);

  for (const groupIdx of sortedGroupIndices) {
    const output = resultsByGroup.get(groupIdx);
    if (!output) continue;

    const { startIndex, endIndex } = groupRanges[groupIdx];
    const itemsToRemove = endIndex - startIndex + 1;
    currentSubtitles.splice(startIndex, itemsToRemove, ...output);
  }

  // ===== Log Token Usage Report =====
  usageReporter.logReport();

  return currentSubtitles;
};

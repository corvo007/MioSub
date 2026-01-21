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
import { mapInParallel } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
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
  speakerProfiles?: SpeakerProfile[]
): Promise<SubtitleItem[]> => {
  // ===== Initialize Pipeline Context =====
  // Use shared initialization (skip OpenAI since proofread doesn't need it)
  const { context, usageReporter, semaphores, concurrency } = initializePipelineContext({
    settings,
    onProgress,
    signal,
    skipOpenAI: true, // Proofread uses only Gemini
  });

  // ===== Decode Audio =====
  let audioBuffer: AudioBuffer | null = null;
  if (file) {
    onProgress?.({
      id: 'init',
      total: 0,
      status: 'processing',
      message: i18n.t('services:pipeline.status.loadingAudio'),
    });
    try {
      audioBuffer = await decodeAudio(file);

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

  // ===== Process Batches in Parallel =====
  await mapInParallel(
    groups,
    batchConcurrency,
    async (group, i) => {
      const firstBatchIdx = group[0];

      // Merge batches in the group
      let mergedBatch: SubtitleItem[] = [];
      let mergedComment = '';

      group.forEach((idx) => {
        if (idx < chunks.length) {
          const batch = chunks[idx];
          mergedBatch = [...mergedBatch, ...batch];

          if (batchComments[idx] && batch.length > 0) {
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
        totalVideoDuration: audioBuffer?.duration,
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

      // ===== Merge Results Back =====
      const firstOriginalId = mergedBatch[0]?.id;
      const lastOriginalId = mergedBatch[mergedBatch.length - 1]?.id;

      if (firstOriginalId && lastOriginalId) {
        const startIdx = currentSubtitles.findIndex((s) => s.id === firstOriginalId);
        const endIdx = currentSubtitles.findIndex((s) => s.id === lastOriginalId);

        if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
          const itemsToRemove = endIdx - startIdx + 1;
          currentSubtitles.splice(startIdx, itemsToRemove, ...output);

          logger.debug(
            `[Batch ${groupLabel}] Replaced ${itemsToRemove} items with ${output.length} processed items`
          );
        } else {
          logger.warn(
            `[Batch ${groupLabel}] Could not find region to update. startIdx=${startIdx}, endIdx=${endIdx}`
          );
        }
      }
    },
    signal
  );

  // ===== Log Token Usage Report =====
  usageReporter.logReport();

  return currentSubtitles;
};

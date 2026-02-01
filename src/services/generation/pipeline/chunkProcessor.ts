/**
 * ChunkProcessor - Orchestrates the subtitle generation pipeline for a single chunk
 *
 * Pipeline: Transcription → WaitDeps → Refinement → Alignment → Translation
 *
 * Semaphore model (matches original):
 * - transcriptionSemaphore: protects transcription step
 * - refinementSemaphore: protects refinement+alignment+translation as a unit
 * - alignmentSemaphore: additional protection for alignment (within refinementSemaphore)
 */

import i18n from '@/i18n';
import { type SubtitleItem } from '@/types/subtitle';
import { type PipelineContext } from '@/types/pipeline';
import { type ChunkParams } from './preprocessor';
import { type StepContext, type ChunkDependencies } from './core/types';
import { MockFactory } from '@/services/generation/debug/mockFactory';
import { logger } from '@/services/utils/logger';
import { UserActionableError } from '@/services/utils/errors';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';
import { getActionableErrorMessage } from '@/services/llm/providers/gemini';
import * as Sentry from '@sentry/electron/renderer';
import {
  TranscriptionStep,
  WaitForDepsStep,
  RefinementStep,
  AlignmentStep,
  TranslationStep,
} from './steps';
import { StepCancelledError } from './core/BaseStep';

import { type ChunkAnalytics } from '@/types/api';

export type { ChunkDependencies } from './core/types';

export interface ChunkResult {
  whisper: SubtitleItem[];
  refined: SubtitleItem[];
  aligned: SubtitleItem[];
  translated: SubtitleItem[];
  final: SubtitleItem[]; // The best available version (translated > refined > whisper)
  /** Analytics timing data for this chunk */
  analytics: ChunkAnalytics;
}

// Step instances (stateless, can be reused)
const transcriptionStep = new TranscriptionStep();
const waitForDepsStep = new WaitForDepsStep();
const refinementStep = new RefinementStep();
const alignmentStep = new AlignmentStep();
const translationStep = new TranslationStep();

export class ChunkProcessor {
  static async process(
    chunk: ChunkParams,
    context: PipelineContext,
    deps: ChunkDependencies
  ): Promise<ChunkResult> {
    const { index, start } = chunk;
    const { settings, isDebug, onProgress } = context;
    const { chunkDuration, totalChunks, refinementSemaphore } = deps;

    // Initialize analytics incrementally - collect timing as we go
    const analytics: ChunkAnalytics = {
      index,
      status: 'success',
      duration_ms: Math.round((chunk.end - chunk.start) * 1000),
      process_ms: 0,
      steps: {
        transcription: { status: 'not_started', duration_ms: 0 },
        refinement: { status: 'not_started', duration_ms: 0 },
        alignment: { status: 'not_started', duration_ms: 0 },
        translation: { status: 'not_started', duration_ms: 0 },
      },
    };

    const processStartTime = Date.now();

    try {
      // Mock Stage Logic Setup
      const mockStageOrder = ['transcribe', 'refinement', 'alignment', 'translation'];
      const currentMockStage = settings.debug?.mockStage;
      const mockStageIndex =
        isDebug && currentMockStage ? mockStageOrder.indexOf(currentMockStage) : -1;

      // Mock mode: Only process the first chunk
      if (mockStageIndex >= 0 && index > 1) {
        logger.info(`[Chunk ${index}] Mock mode enabled - skipping non-first chunk`);
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.complete'),
        });
        return {
          whisper: [],
          refined: [],
          aligned: [],
          translated: [],
          final: [],
          analytics: {
            index,
            status: 'skipped',
            process_ms: Date.now() - processStartTime,
            duration_ms: analytics.duration_ms,
            steps: {
              transcription: { status: 'skipped', duration_ms: 0 },
              refinement: { status: 'skipped', duration_ms: 0 },
              alignment: { status: 'skipped', duration_ms: 0 },
              translation: { status: 'skipped', duration_ms: 0 },
            },
          },
        };
      }

      // Load mock data if mockStage is set
      let mockInputSegments: SubtitleItem[] = [];
      if (mockStageIndex >= 0) {
        logger.info(
          `[Chunk ${index}] Mock mode: Starting from '${currentMockStage}' stage, loading mock data...`
        );
        mockInputSegments = await MockFactory.getMockTranscription(
          index,
          chunk.start,
          chunk.end,
          settings.debug?.mockDataPath
        );
        logger.info(`[Chunk ${index}] Loaded ${mockInputSegments.length} segments from mock data`);
      }

      // Create step context
      const ctx: StepContext = {
        chunk,
        chunkDuration,
        totalChunks,
        pipelineContext: context,
        deps,
        mockStageIndex,
        mockInputSegments,
      };

      // ===== STEP 1: TRANSCRIPTION =====
      const transcriptionResult = await transcriptionStep.run({}, ctx);
      const rawSegments = transcriptionResult.output;
      analytics.steps.transcription = {
        status: transcriptionResult.status as any,
        duration_ms: transcriptionResult.durationMs,
      };

      // Skip if no segments
      if (rawSegments.length === 0) {
        logger.warn(`[Chunk ${index}] No segments available, skipping`);
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.completeNoContent'),
        });
        return {
          whisper: [],
          refined: [],
          aligned: [],
          translated: [],
          final: [],
          analytics: { ...analytics, status: 'empty', process_ms: Date.now() - processStartTime },
        };
      }

      // Check skipAfter: transcribe
      if (settings.debug?.skipAfter === 'transcribe') {
        logger.info(`[Chunk ${index}] skipAfter='transcribe' - stopping pipeline`);
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.complete'),
        });
        const whisperGlobal = toGlobalTimestamps(rawSegments, start);
        return {
          whisper: whisperGlobal,
          refined: whisperGlobal,
          aligned: whisperGlobal,
          translated: whisperGlobal,
          final: whisperGlobal,
          analytics: { ...analytics, status: 'success', process_ms: Date.now() - processStartTime },
        };
      }

      // ===== STEP 2: WAIT FOR DEPS =====
      const waitResult = await waitForDepsStep.run({ segments: rawSegments }, ctx);
      // Update context with glossary and speaker profiles
      ctx.glossary = waitResult.output.glossary;
      ctx.speakerProfiles = waitResult.output.speakerProfiles;

      // ===== STEPS 3-5: REFINEMENT + ALIGNMENT + TRANSLATION =====
      // These steps are protected by refinementSemaphore as a unit (matches original behavior)
      await refinementSemaphore.acquire();

      let refinedSegments: SubtitleItem[] = [];
      let alignedSegments: SubtitleItem[] = [];
      let finalChunkSubs: SubtitleItem[] = [];

      try {
        // ===== STEP 3: REFINEMENT =====
        const refinementResult = await refinementStep.runWithoutSemaphore(
          { segments: rawSegments },
          ctx
        );
        refinedSegments = refinementResult.output;
        analytics.steps.refinement = {
          status: refinementResult.status as any,
          duration_ms: refinementResult.durationMs,
        };

        // Check skipAfter: refinement
        if (settings.debug?.skipAfter === 'refinement') {
          logger.info(`[Chunk ${index}] skipAfter='refinement' - stopping pipeline`);
          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'completed',
            message: i18n.t('services:pipeline.status.complete'),
          });
          const refinedGlobal = toGlobalTimestamps(refinedSegments, start);
          return {
            whisper: toGlobalTimestamps(rawSegments, start),
            refined: refinedGlobal,
            aligned: refinedGlobal,
            translated: refinedGlobal,
            final: refinedGlobal,
            analytics: {
              ...analytics,
              status: 'success',
              process_ms: Date.now() - processStartTime,
            },
          };
        }

        // ===== STEP 4: ALIGNMENT =====
        // Alignment has its own semaphore (alignmentSemaphore) managed internally
        const alignmentResult = await alignmentStep.run({ segments: refinedSegments }, ctx);
        alignedSegments =
          alignmentResult.status === 'skipped' ? refinedSegments : alignmentResult.output;
        analytics.steps.alignment = {
          status: alignmentResult.status as any,
          duration_ms: alignmentResult.durationMs,
        };

        // Check skipAfter: alignment
        if (settings.debug?.skipAfter === 'alignment') {
          logger.info(`[Chunk ${index}] skipAfter='alignment' - stopping pipeline`);
          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'completed',
            message: i18n.t('services:pipeline.status.complete'),
          });
          const alignedGlobal = toGlobalTimestamps(alignedSegments, start);
          return {
            whisper: toGlobalTimestamps(rawSegments, start),
            refined: toGlobalTimestamps(refinedSegments, start),
            aligned: alignedGlobal,
            translated: alignedGlobal,
            final: alignedGlobal,
            analytics: {
              ...analytics,
              status: 'success',
              process_ms: Date.now() - processStartTime,
            },
          };
        }

        // ===== STEP 5: TRANSLATION =====
        const translationResult = await translationStep.runWithoutSemaphore(
          { segments: alignedSegments },
          ctx
        );
        const translatedSegments =
          translationResult.status === 'skipped' ? [] : translationResult.output;
        finalChunkSubs = toGlobalTimestamps(translatedSegments, start);
        analytics.steps.translation = {
          status: translationResult.status as any,
          duration_ms: translationResult.durationMs,
        };

        // Store final analytics in deps for later aggregation
        analytics.process_ms = Date.now() - processStartTime;
        deps.chunkAnalytics = analytics;

        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.completed'),
          analytics,
        });
      } finally {
        refinementSemaphore.release();
      }

      // Construct result with global timestamps
      const whisperGlobal = toGlobalTimestamps(rawSegments, start);
      const refinedGlobal = toGlobalTimestamps(refinedSegments, start);
      const alignedGlobal = toGlobalTimestamps(alignedSegments, start);

      return {
        whisper: whisperGlobal,
        refined: refinedGlobal,
        aligned: alignedGlobal,
        translated: finalChunkSubs,
        final:
          finalChunkSubs.length > 0
            ? finalChunkSubs
            : alignedGlobal.length > 0
              ? alignedGlobal
              : refinedGlobal.length > 0
                ? refinedGlobal
                : [],
        analytics: deps.chunkAnalytics!,
      };
    } catch (e: any) {
      // Check for cancellation - extract timing from StepCancelledError if available
      if (
        context.signal?.aborted ||
        e.name === 'StepCancelledError' ||
        e.message === i18n.t('services:pipeline.errors.cancelled') ||
        e.name === 'AbortError'
      ) {
        // Extract timing from StepCancelledError if it was the cancelled step
        if (e instanceof StepCancelledError) {
          // Set timing for the step that was cancelled (based on stepName)
          const stepMap: Record<string, keyof ChunkAnalytics['steps']> = {
            TranscriptionStep: 'transcription',
            RefinementStep: 'refinement',
            AlignmentStep: 'alignment',
            TranslationStep: 'translation',
          };
          const stepKey = stepMap[e.stepName];
          if (stepKey && analytics.steps[stepKey]) {
            analytics.steps[stepKey] = {
              status: 'cancelled',
              duration_ms: e.durationMs,
            };
          }
        }

        // Report partial analytics with 'cancelled' status before re-throwing
        analytics.status = 'cancelled';
        analytics.process_ms = Date.now() - processStartTime;
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'error',
          message: i18n.t('services:pipeline.errors.cancelled'),
          analytics,
        });
        throw e;
      }

      logger.error(`Chunk ${index} failed`, e);
      const actionableMsg = getActionableErrorMessage(e);
      const errorMsg = actionableMsg || i18n.t('services:pipeline.status.failed');
      analytics.status = 'failed';
      analytics.process_ms = Date.now() - processStartTime;

      // Track whether this failure was due to a user-actionable error
      const isUserActionable =
        e instanceof UserActionableError ||
        actionableMsg != null ||
        e.message?.includes('cancelled') ||
        e.message?.includes('aborted');
      analytics.isUserActionable = isUserActionable;

      onProgress?.({
        id: index,
        total: totalChunks,
        status: 'error',
        message: errorMsg,
        analytics,
      });

      // Sentry: Report chunk failure with context
      // Skip user-actionable errors (auth, quota, billing) - these are not bugs
      if (!isUserActionable) {
        Sentry.captureException(e, {
          level: 'warning',
          tags: { source: 'chunk_processor' },
          extra: { chunk_index: index, total_chunks: totalChunks },
        });
      }

      return {
        whisper: [],
        refined: [],
        aligned: [],
        translated: [],
        final: [],
        analytics,
      };
    }
  }
}

/** Convert chunk-local timestamps to global timestamps */
function toGlobalTimestamps(segments: SubtitleItem[], chunkStart: number): SubtitleItem[] {
  return segments.map((seg) => ({
    ...seg,
    startTime: formatTime(timeToSeconds(seg.startTime) + chunkStart),
    endTime: formatTime(timeToSeconds(seg.endTime) + chunkStart),
  }));
}

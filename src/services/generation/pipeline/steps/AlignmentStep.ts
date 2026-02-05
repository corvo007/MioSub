/**
 * AlignmentStep - Handles CTC/Gemini alignment for subtitle timing
 */

import { BaseStep } from '@/services/generation/pipeline/core/BaseStep';
import { type StepContext, type StepName } from '@/services/generation/pipeline/core/types';
import { type SubtitleItem } from '@/types/subtitle';
import { getAudioSegment } from '@/services/audio/audioSourceHelper';
import { createAligner } from '@/services/alignment';
import { iso639_1To3, detectLanguage } from '@/services/utils/language';
import { CONFIDENCE_THRESHOLD, requiresRomanization } from '@/services/alignment/utils';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { logger } from '@/services/utils/logger';

export interface AlignmentInput {
  segments: SubtitleItem[];
}

export class AlignmentStep extends BaseStep<AlignmentInput, SubtitleItem[]> {
  name: StepName = 'alignment';
  stageKey = 'aligning' as const;

  /**
   * Returns alignmentSemaphore only if alignment is enabled.
   * This prevents unnecessary semaphore acquisition when alignmentMode='none'.
   * (Optimization: original code didn't acquire semaphore when alignment disabled)
   */
  protected getSemaphore(ctx: StepContext) {
    const { alignmentMode } = ctx.pipelineContext.settings;
    // Don't acquire semaphore if alignment is disabled
    if (!alignmentMode || alignmentMode === 'none') {
      return null;
    }
    return ctx.deps.alignmentSemaphore;
  }

  protected preCheck(input: AlignmentInput, ctx: StepContext): boolean {
    const { alignmentMode } = ctx.pipelineContext.settings;
    // Skip if alignment is disabled
    if (!alignmentMode || alignmentMode === 'none') {
      return false;
    }
    return true;
  }

  // Note: No loadMockData here - mockApi.alignment should do pass-through (skip CTC),
  // not load from file. The pass-through is handled inside execute().

  protected async execute(input: AlignmentInput, ctx: StepContext): Promise<SubtitleItem[]> {
    const { chunk, deps, pipelineContext } = ctx;
    const { ai, settings, signal, trackUsage } = pipelineContext;
    const { audioBuffer, videoPath, isLongVideo } = deps;

    // Mock API: pass-through (skip CTC processing)
    if (settings.debug?.mockApi?.alignment) {
      logger.info(`[Chunk ${chunk.index}] Mocking alignment (pass-through, skipping CTC)`);
      return input.segments.map((s) => ({ ...s }));
    }

    logger.info(
      `[Chunk ${chunk.index}] Starting alignment (mode: ${settings.alignmentMode}, segments: ${input.segments.length})`
    );

    const aligner = createAligner(settings);

    // Detect language
    const segmentsForDetection = input.segments.length > 0 ? input.segments : ctx.mockInputSegments;
    let detectedLang = 'en';

    if (settings.debug?.mockLanguage && settings.debug.mockLanguage !== 'auto') {
      detectedLang = settings.debug.mockLanguage;
      logger.info(`[Chunk ${chunk.index}] Using configured mock language: ${detectedLang}`);
    } else {
      const sampleText = segmentsForDetection
        .slice(0, 5)
        .map((s) => s.original)
        .join(' ');
      detectedLang = await detectLanguage(sampleText);
    }

    const language = iso639_1To3(detectedLang);
    const romanize = requiresRomanization(language);
    logger.info(
      `[Chunk ${chunk.index}] Alignment Language: ${detectedLang} → ${language} (Source: ${settings.debug?.mockLanguage ? 'Manual' : 'Auto'}, Romanize: ${romanize})`
    );

    // Store alignment context for error logging
    (ctx as any).alignmentContext = {
      language,
      romanize,
      segmentCount: input.segments.length,
      sampleText: input.segments
        .slice(0, 3)
        .map((s) => s.original?.substring(0, 50))
        .join(' | '),
    };

    // Prepare temp audio file for CTC alignment
    let tempAudioPath = '';
    if (settings.alignmentMode === 'ctc') {
      try {
        let audioDataForTemp: string | ArrayBuffer;

        if (ctx.base64Audio) {
          // Use cached base64 audio from refinement step
          audioDataForTemp = ctx.base64Audio;
        } else {
          // No cache, extract audio segment
          const wavBlob = await getAudioSegment(
            { audioBuffer, videoPath, isLongVideo },
            chunk.start,
            chunk.end,
            'alignment'
          );
          audioDataForTemp = await wavBlob.arrayBuffer();
        }

        const result = await window.electronAPI.writeTempAudioFile(audioDataForTemp, 'wav');
        if (result.success && result.path) {
          tempAudioPath = result.path;
        } else {
          logger.warn(
            `[Chunk ${chunk.index}] Failed to save temp audio for alignment: ${result.error}`
          );
        }
      } catch (err) {
        logger.error(`[Chunk ${chunk.index}] Error preparing audio for alignment:`, err);
      }
    }

    // Validate CTC requirements
    if (settings.alignmentMode === 'ctc' && !tempAudioPath) {
      logger.warn(`[Chunk ${chunk.index}] Skipping CTC alignment: Failed to write temp file`);
      return [...input.segments];
    }

    try {
      return await aligner.align(
        input.segments,
        tempAudioPath,
        language,
        { ai, signal, trackUsage, genre: settings.genre },
        ctx.base64Audio
      );
    } finally {
      if (tempAudioPath) {
        window.electronAPI.cleanupTempAudio(tempAudioPath).catch((e) => {
          logger.warn(`[Chunk ${chunk.index}] Failed to cleanup temp audio:`, e);
        });
      }
    }
  }

  protected postProcess(output: SubtitleItem[], ctx: StepContext): SubtitleItem[] {
    // Log low confidence stats
    const lowConfCount = output.filter((s) => s.lowConfidence).length;
    if (lowConfCount > 0) {
      logger.warn(
        `[Chunk ${ctx.chunk.index}] Alignment: ${lowConfCount}/${output.length} segments have low confidence (<${CONFIDENCE_THRESHOLD})`
      );
    }
    return output;
  }

  protected getFallback(input: AlignmentInput, error: Error, ctx: StepContext): SubtitleItem[] {
    // Log detailed context for debugging CTC failures
    const alignmentContext = (ctx as any).alignmentContext;
    if (alignmentContext) {
      logger.error(`[Chunk ${ctx.chunk.index}] Alignment failed with context:`, {
        language: alignmentContext.language,
        romanize: alignmentContext.romanize,
        segmentCount: alignmentContext.segmentCount,
        sampleText: alignmentContext.sampleText,
        errorMessage: error.message,
        errorStack: error.stack,
      });
    } else {
      logger.error(
        `[Chunk ${ctx.chunk.index}] Alignment failed, using refinement timestamps:`,
        error
      );
    }
    return [...input.segments];
  }

  protected async saveArtifact(result: SubtitleItem[], ctx: StepContext): Promise<void> {
    ArtifactSaver.saveChunkArtifact(
      ctx.chunk.index,
      'alignment',
      result,
      ctx.pipelineContext.settings
    );
  }
}

/**
 * TranslationStep - Handles subtitle translation via Gemini API
 */

import { BaseStep } from '@/services/generation/pipeline/core/BaseStep';
import { type StepContext, type StepName } from '@/services/generation/pipeline/core/types';
import { type SubtitleItem } from '@/types/subtitle';
import { getSystemInstruction } from '@/services/llm/prompts';
import { formatGeminiError } from '@/services/llm/providers/gemini';
import { translateBatch } from '@/services/generation/pipeline/translation';
import { cleanNonSpeechAnnotations } from '@/services/subtitle/parser';
import { removeTrailingPunctuation } from '@/services/subtitle/punctuationCleaner';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { MockFactory } from '@/services/generation/debug/mockFactory';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

export interface TranslationInput {
  segments: SubtitleItem[];
}

export class TranslationStep extends BaseStep<TranslationInput, SubtitleItem[]> {
  name: StepName = 'translation';
  stageKey = 'translating' as const;

  // Translation uses refinementSemaphore (shared with refinement step)
  protected getSemaphore(ctx: StepContext) {
    return ctx.deps.refinementSemaphore;
  }

  protected preCheck(input: TranslationInput): boolean {
    return input.segments.length > 0;
  }

  // Note: No loadMockData here - mockApi.translation needs to process mock data through
  // convertToSubtitleItems for proper reconciliation. The mock handling is inside execute().

  protected async execute(input: TranslationInput, ctx: StepContext): Promise<SubtitleItem[]> {
    const { chunk, pipelineContext } = ctx;
    const { ai, settings, signal, trackUsage, onProgress } = pipelineContext;
    const targetLanguage = settings.targetLanguage || 'Simplified Chinese';
    const glossary = ctx.glossary || [];
    const speakerProfiles = ctx.speakerProfiles;

    const profilesForTranslation =
      settings.useSpeakerStyledTranslation && speakerProfiles ? speakerProfiles : undefined;

    const translateSystemInstruction = getSystemInstruction(
      settings.genre,
      settings.customTranslationPrompt,
      'translation',
      glossary,
      profilesForTranslation,
      targetLanguage
    );

    // Check for mock API
    if (settings.debug?.mockApi?.translation) {
      logger.info(
        `[Chunk ${chunk.index}] Mocking Translation API Call (injecting mock data into reconciliation flow)`
      );
      const mockData = await MockFactory.getMockTranslation(
        chunk.index,
        input.segments,
        settings.debug?.mockDataPath
      );
      // Convert SubtitleItem (mock) to TranslationItem structure then back
      const items = mockData.map((s) => ({
        id: s.id,
        start: s.startTime,
        end: s.endTime,
        original: s.original,
        translated: s.translated,
        speaker: s.speaker,
      }));
      return this.convertToSubtitleItems(items, input.segments, settings.enableDiarization);
    }

    // Real API call
    const items = await translateBatch(
      ai,
      input.segments,
      translateSystemInstruction,
      1,
      settings.translationBatchSize || 20,
      (update) =>
        onProgress?.({
          id: chunk.index,
          total: ctx.totalChunks,
          status: 'processing',
          stage: 'translating',
          ...update,
        }),
      signal,
      trackUsage,
      (settings.requestTimeout || 600) * 1000,
      !!(settings.enableDiarization && settings.useSpeakerStyledTranslation),
      targetLanguage
    );

    logger.debug(`[Chunk ${chunk.index}] Translation complete. Items: ${items.length}`);
    if (items.length > 0 && settings.enableDiarization) {
      logger.debug(`[Chunk ${chunk.index}] Translation first segment speaker: ${items[0].speaker}`);
    }

    return this.convertToSubtitleItems(items, input.segments, settings.enableDiarization);
  }

  private convertToSubtitleItems(
    items: any[],
    alignedSegments: SubtitleItem[],
    enableDiarization?: boolean
  ): SubtitleItem[] {
    const alignedMap = new Map(alignedSegments.map((s) => [s.id, s]));

    return items.map((item) => {
      const originalSeg = alignedMap.get(item.id);
      if (!originalSeg) {
        return {
          id: item.id,
          startTime: item.start || '00:00:00,000',
          endTime: item.end || '00:00:00,000',
          original: item.original || '',
          translated: item.translated,
        };
      }

      return {
        ...originalSeg,
        translated: item.translated,
        ...(enableDiarization && item.speaker ? { speaker: item.speaker } : {}),
      };
    });
  }

  protected postProcess(output: SubtitleItem[], ctx: StepContext): SubtitleItem[] {
    // Filter out music segments and empty content
    let result = output.filter((seg) => {
      const cleanOriginal = cleanNonSpeechAnnotations(seg.original || '');
      const cleanTranslated = cleanNonSpeechAnnotations(seg.translated || '');
      const hasContent = cleanOriginal.length > 0 || cleanTranslated.length > 0;

      if (!hasContent) {
        logger.debug(`[Chunk ${ctx.chunk.index}] Filtering out empty/music segment: ${seg.id}`);
      }
      return hasContent;
    });

    // Remove trailing punctuation if enabled
    if (ctx.pipelineContext.settings.removeTrailingPunctuation) {
      result = removeTrailingPunctuation(result);
    }

    return result;
  }

  protected getFallback(input: TranslationInput, error: Error, ctx: StepContext): SubtitleItem[] {
    logger.error(
      i18n.t('services:pipeline.errors.translationFailedKeepRefined', { index: ctx.chunk.index }),
      formatGeminiError(error)
    );
    // Return aligned segments without translation
    return [...input.segments];
  }

  protected async saveArtifact(result: SubtitleItem[], ctx: StepContext): Promise<void> {
    ArtifactSaver.saveChunkArtifact(
      ctx.chunk.index,
      'translation',
      result,
      ctx.pipelineContext.settings
    );
  }
}

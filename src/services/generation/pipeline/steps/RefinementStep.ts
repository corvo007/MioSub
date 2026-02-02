/**
 * RefinementStep - Handles subtitle refinement via Gemini API
 *
 * Includes full validation pipeline with withPostCheck
 */

import { BaseStep } from '@/services/generation/pipeline/core/BaseStep';
import { type StepContext, type StepName } from '@/services/generation/pipeline/core/types';
import { type SubtitleItem } from '@/types/subtitle';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { extractSegmentAsBlob } from '@/services/audio/segmentExtractor';
import { blobToBase64 } from '@/services/audio/converter';
import { getSystemInstructionWithDiarization, getRefinementPrompt } from '@/services/llm/prompts';
import { REFINEMENT_SCHEMA, REFINEMENT_WITH_DIARIZATION_SCHEMA } from '@/services/llm/schemas';
import { generateContentWithRetry, formatGeminiError } from '@/services/llm/providers/gemini';
import { STEP_MODELS, buildStepConfig } from '@/config';
import { parseGeminiResponse } from '@/services/subtitle/parser';
import { withPostCheck } from '@/services/subtitle/postCheck';
import { reconcile } from '@/services/subtitle/reconciler';
import { toRefinementPayloads } from '@/services/subtitle/payloads';
import { createRefinementPostProcessor } from '@/services/generation/pipeline/postProcessors';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { MockFactory } from '@/services/generation/debug/mockFactory';
import { detectLanguage, toLocaleCode } from '@/services/utils/language';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

export interface RefinementInput {
  segments: SubtitleItem[];
}

export class RefinementStep extends BaseStep<RefinementInput, SubtitleItem[]> {
  name: StepName = 'refinement';
  stageKey = 'refining' as const;

  protected getSemaphore(ctx: StepContext) {
    return ctx.deps.refinementSemaphore;
  }

  // Note: No loadMockData here - mockApi.refinement should inject mock data into the
  // withPostCheck validation flow (see execute). This ensures mock data goes through
  // the same validation pipeline as real API responses.

  protected async execute(input: RefinementInput, ctx: StepContext): Promise<SubtitleItem[]> {
    const { chunk, deps, pipelineContext, chunkDuration } = ctx;
    const { ai, settings, signal, trackUsage } = pipelineContext;
    const { audioBuffer, videoPath, isLongVideo } = deps;
    const targetLanguage = settings.targetLanguage || 'Simplified Chinese';
    const glossary = ctx.glossary || [];
    const speakerProfiles = ctx.speakerProfiles;

    // Store raw segments in context for postProcess (thread-safe per chunk)
    ctx.rawSegments = input.segments;

    // Prepare audio (skip if mockApi.refinement - optimization matching original)
    let base64Audio = '';
    if (!settings.debug?.mockApi?.refinement) {
      let refineWavBlob: Blob;

      if (isLongVideo && videoPath) {
        // Long video mode: extract segment on-demand via FFmpeg
        logger.debug(
          `[Chunk ${chunk.index}] Using on-demand segment extraction for refinement (long video mode)`
        );
        refineWavBlob = await extractSegmentAsBlob(videoPath, chunk.start, chunk.end - chunk.start);
      } else if (audioBuffer) {
        // Standard mode: slice from in-memory AudioBuffer
        refineWavBlob = await sliceAudioBuffer(audioBuffer, chunk.start, chunk.end);
      } else {
        throw new Error('No audio source available for refinement');
      }

      base64Audio = await blobToBase64(refineWavBlob);
      ctx.base64Audio = base64Audio; // Cache for alignment step
    }

    // Generate prompts
    const refineSystemInstruction = getSystemInstructionWithDiarization(
      settings.genre,
      settings.customRefinementPrompt,
      'refinement',
      glossary,
      settings.enableDiarization,
      speakerProfiles,
      settings.minSpeakers,
      settings.maxSpeakers,
      targetLanguage
    );

    const glossaryInfo =
      glossary.length > 0
        ? `\n\nKEY TERMINOLOGY (Listen for these terms in the audio and transcribe them accurately in the ORIGINAL LANGUAGE):\n${glossary.map((g) => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n')}`
        : '';

    const payload = toRefinementPayloads(input.segments, {
      includeSpeaker: settings.enableDiarization,
    });

    const refinePrompt = getRefinementPrompt({
      genre: settings.genre,
      payload,
      glossaryInfo,
      glossaryCount: glossary.length,
      enableDiarization: settings.enableDiarization,
      targetLanguage,
    });

    // Detect language for post-processing
    const sampleRefineText = input.segments
      .slice(0, 5)
      .map((s) => s.original)
      .join(' ');
    const detectedRefineLang = await detectLanguage(sampleRefineText);

    // Execution wrapper with validation
    const refinementGenerator = async () => {
      if (settings.debug?.mockApi?.refinement) {
        logger.info(
          `[Chunk ${chunk.index}] Mocking Refinement API Call (injecting mock data into validation flow)`
        );
        return MockFactory.getMockRefinement(
          chunk.index,
          input.segments,
          settings.debug?.mockDataPath
        );
      }

      // Real API Call
      const response = await generateContentWithRetry(
        ai,
        {
          model: STEP_MODELS.refinement,
          contents: {
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
              { text: refinePrompt },
            ],
          },
          config: {
            responseSchema: settings.enableDiarization
              ? REFINEMENT_WITH_DIARIZATION_SCHEMA
              : REFINEMENT_SCHEMA,
            systemInstruction: refineSystemInstruction,
            ...buildStepConfig('refinement'),
          },
        },
        3,
        signal,
        trackUsage,
        (settings.requestTimeout || 600) * 1000
      );
      return parseGeminiResponse(response.text, chunkDuration);
    };

    // Execute with post-check validation
    const { result: processedSegments } = await withPostCheck(
      refinementGenerator,
      createRefinementPostProcessor(toLocaleCode(detectedRefineLang), input.segments),
      { maxRetries: 1, stepName: `[Chunk ${chunk.index}]` }
    );

    return processedSegments;
  }

  protected async postProcess(output: SubtitleItem[], ctx: StepContext): Promise<SubtitleItem[]> {
    // Reconcile with original segments (from context, thread-safe per chunk)
    const rawSegments = ctx.rawSegments || [];
    let result = reconcile(rawSegments, output);
    if (result.length === 0) {
      result = [...rawSegments];
    }

    logger.debug(`[Chunk ${ctx.chunk.index}] Refinement complete. Segments: ${result.length}`);
    if (result.length > 0 && ctx.pipelineContext.settings.enableDiarization) {
      logger.debug(`[Chunk ${ctx.chunk.index}] First segment speaker: ${result[0].speaker}`);
    }

    return result;
  }

  protected getFallback(input: RefinementInput, error: Error, ctx: StepContext): SubtitleItem[] {
    logger.error(
      i18n.t('services:pipeline.status.refinementFailed', { index: ctx.chunk.index }),
      formatGeminiError(error)
    );
    return [...input.segments];
  }

  protected async saveArtifact(result: SubtitleItem[], ctx: StepContext): Promise<void> {
    ArtifactSaver.saveChunkArtifact(
      ctx.chunk.index,
      'refinement',
      result,
      ctx.pipelineContext.settings
    );
  }
}

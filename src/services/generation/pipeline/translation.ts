/**
 * Translation Module - Batch translation logic for subtitle generation
 *
 * Provides shared translation functionality used by both:
 * - Pipeline (initial generation)
 * - Batch operations (post-processing)
 */

import { type GoogleGenAI } from '@google/genai';
import { type TokenUsage } from '@/types/api';
import { logger } from '@/services/utils/logger';
import { mapInParallel } from '@/services/utils/concurrency';
import { getTranslationBatchPrompt } from '@/services/llm/prompts';
import {
  generateContentWithRetry,
  formatGeminiError,
  getActionableErrorMessage,
} from '@/services/llm/providers/gemini';
import { TRANSLATION_SCHEMA, TRANSLATION_WITH_DIARIZATION_SCHEMA } from '@/services/llm/schemas';
import { STEP_MODELS, buildStepConfig } from '@/config';
import { withPostCheck } from '@/services/subtitle/postCheck';
import {
  createTranslationPostProcessor,
  type RawTranslationResult,
} from '@/services/generation/pipeline/postProcessors';
import i18n from '@/i18n';
import { toTranslationPayloads } from '@/services/subtitle/payloads';

/**
 * Process a translation batch with post-check validation.
 * API-level retries are handled by generateContentWithRetry.
 * Missing translation retries are handled by the post-processor.
 */
export async function processTranslationBatch(
  ai: GoogleGenAI,
  batch: any[],
  systemInstruction: string,
  onStatusUpdate?: (update: {
    message?: string;
    toast?: { message: string; type: 'info' | 'warning' | 'error' | 'success' };
  }) => void,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number,
  useDiarization: boolean = false,
  targetLanguage?: string
): Promise<any[]> {
  const payload = toTranslationPayloads(batch, {
    includeSpeaker: useDiarization,
  });

  const prompt = getTranslationBatchPrompt(batch.length, payload, targetLanguage);

  try {
    const { result } = await withPostCheck(
      // Generate function: call API and parse response
      async (): Promise<RawTranslationResult> => {
        const translatedData = await generateContentWithRetry<any[]>(
          ai,
          {
            model: STEP_MODELS.translation,
            contents: { parts: [{ text: prompt }] },
            config: {
              responseSchema: useDiarization
                ? TRANSLATION_WITH_DIARIZATION_SCHEMA
                : TRANSLATION_SCHEMA,
              systemInstruction: systemInstruction,
              ...buildStepConfig('translation'),
            },
          },
          3,
          signal,
          onUsage,
          timeoutMs,
          'array'
        );

        const transMap = new Map<string, string>(
          translatedData.map((t: any) => [String(t.id), t.text_translated as string])
        );

        return { transMap, batch };
      },
      // Post-process function: check missing, retry, build result
      createTranslationPostProcessor(
        ai,
        systemInstruction,
        onStatusUpdate,
        signal,
        onUsage,
        timeoutMs,
        useDiarization,
        targetLanguage
      ),
      { maxRetries: 1, stepName: 'Translation' }
    );

    return result;
  } catch (e: any) {
    // API or parse error - log and fallback to original text
    logger.error('Translation batch failed', formatGeminiError(e));
    const actionableMsg = getActionableErrorMessage(e);
    const errorMsg = actionableMsg
      ? i18n.t('services:pipeline.errors.translationFailed', { error: actionableMsg })
      : i18n.t('services:pipeline.errors.translationFailedUseOriginal');
    onStatusUpdate?.({
      toast: {
        message: errorMsg,
        type: 'error',
      },
    });
    return batch.map((item) => ({ ...item, translated: item.original }));
  }
}

/**
 * Translate items in batches with concurrency control
 */
export async function translateBatch(
  ai: GoogleGenAI,
  items: any[],
  systemInstruction: string,
  concurrency: number,
  batchSize: number,
  onStatusUpdate?: (update: {
    message?: string;
    toast?: { message: string; type: 'info' | 'warning' | 'error' | 'success' };
  }) => void,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number,
  useDiarization: boolean = false,
  targetLanguage?: string
): Promise<any[]> {
  const batches: any[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const batchResults = await mapInParallel(
    batches,
    concurrency,
    async (batch) => {
      return await processTranslationBatch(
        ai,
        batch,
        systemInstruction,
        onStatusUpdate,
        signal,
        onUsage,
        timeoutMs,
        useDiarization,
        targetLanguage
      );
    },
    signal
  );

  return batchResults.flat();
}

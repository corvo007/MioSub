/**
 * PostProcessors - Business-specific post-processing logic for Gemini API results
 *
 * Contains postprocessors that work with the withPostCheck framework in postCheck.ts
 */

import { type GoogleGenAI } from '@google/genai';
import { type SubtitleItem } from '@/types/subtitle';
import { type TokenUsage } from '@/types/api';
import { logger } from '@/services/utils/logger';
import { cleanNonSpeechAnnotations } from '@/services/subtitle/parser';
import {
  validateTimeline,
  markRegressionIssues,
  markCorruptedRange,
} from '@/services/subtitle/timelineValidator';
import { type PostProcessOutput, type PostCheckResult } from '@/services/subtitle/postCheck';
import { getTranslationBatchPrompt } from '@/services/api/gemini/core/prompts';
import { generateContentWithRetry, formatGeminiError } from '@/services/api/gemini/core/client';
import {
  TRANSLATION_SCHEMA,
  TRANSLATION_WITH_DIARIZATION_SCHEMA,
  SAFETY_SETTINGS,
} from '@/services/api/gemini/core/schemas';
import { STEP_MODELS, buildStepConfig } from '@/config';

// ===== Types =====

/** Raw translation result from API */
export interface RawTranslationResult {
  transMap: Map<string, string>;
  batch: any[];
}

// ===== Refinement PostProcessor =====

/**
 * Create a post-processor for refinement that handles:
 * 1. Clean non-speech annotations
 * 2. Filter empty segments
 * 3. Validate timeline
 * 4. Apply issue markers (if validation fails and not retryable)
 */
export function createRefinementPostProcessor() {
  return (
    segments: SubtitleItem[],
    isFinalAttempt: boolean = false
  ): PostProcessOutput<SubtitleItem[]> => {
    // Step 1: Clean non-speech annotations
    let processed = segments.map((seg) => ({
      ...seg,
      original: cleanNonSpeechAnnotations(seg.original),
    }));

    // Step 2: Filter empty segments
    processed = processed.filter((seg) => seg.original.length > 0);

    // Step 3: Validate timeline
    const validation = validateTimeline(processed);

    // Step 4: Convert validation result to PostCheckResult
    const checkResult = mapValidationToCheckResult(validation);

    // Step 5: Apply markers on final attempt (when no more retries)
    if (isFinalAttempt && !checkResult.isValid) {
      if (validation.independentAnomalies.length > 0) {
        processed = markRegressionIssues(processed, validation.independentAnomalies);
      }
      if (validation.corruptedRanges.length > 0) {
        processed = markCorruptedRange(processed, validation.corruptedRanges);
      }
    }

    return { result: processed, checkResult };
  };
}

// ===== Translation PostProcessor =====

/**
 * Create a post-processor for translation that handles:
 * 1. Missing translation detection
 * 2. Retry for missing items (via API call)
 * 3. Fallback to original text
 * 4. Result building
 */
export function createTranslationPostProcessor(
  ai: GoogleGenAI,
  systemInstruction: string,
  onStatusUpdate?: (update: {
    message?: string;
    toast?: { message: string; type: 'info' | 'warning' | 'error' | 'success' };
  }) => void,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number,
  useDiarization: boolean = false
) {
  return async (
    rawResult: RawTranslationResult,
    isFinalAttempt: boolean
  ): Promise<PostProcessOutput<any[]>> => {
    const { transMap, batch } = rawResult;

    // Step 1: Check for missing translations
    const missingItems = batch.filter((item) => {
      const translated = transMap.get(String(item.id));
      return !translated || translated.trim().length === 0;
    });

    // Step 2: Retry missing items if not final attempt and partial failure
    if (!isFinalAttempt && missingItems.length > 0 && missingItems.length < batch.length) {
      logger.info(`Retrying ${missingItems.length} missing translations...`);
      onStatusUpdate?.({ message: `重试 ${missingItems.length} 条漏翻...` });

      try {
        const retryPayload = missingItems.map((item) => ({
          id: item.id,
          text: item.original,
          speaker: item.speaker,
        }));
        const retryPrompt = getTranslationBatchPrompt(missingItems.length, retryPayload);

        const retryData = await generateContentWithRetry<any[]>(
          ai,
          {
            model: STEP_MODELS.translation,
            contents: { parts: [{ text: retryPrompt }] },
            config: {
              responseMimeType: 'application/json',
              safetySettings: SAFETY_SETTINGS,
              responseSchema: useDiarization
                ? TRANSLATION_WITH_DIARIZATION_SCHEMA
                : TRANSLATION_SCHEMA,
              ...buildStepConfig('translation'),
            },
          },
          2,
          signal,
          onUsage,
          timeoutMs,
          'array'
        );

        // Merge retry results
        let recoveredCount = 0;
        retryData.forEach((t: any) => {
          if (t.text_translated && t.text_translated.trim().length > 0) {
            transMap.set(String(t.id), t.text_translated);
            recoveredCount++;
          }
        });

        if (recoveredCount > 0) {
          logger.info(`Recovered ${recoveredCount}/${missingItems.length} translations on retry`);
        }
      } catch (retryError) {
        logger.warn(`Retry failed for missing translations`, {
          error: formatGeminiError(retryError),
        });
      }
    }

    // Step 3: Build final result with fallback to original text
    let fallbackCount = 0;
    const result = batch.map((item) => {
      const translatedText = transMap.get(String(item.id));

      if (!translatedText || translatedText.trim().length === 0) {
        if (isFinalAttempt) {
          logger.warn(`Translation missing for ID ${item.id}, using original text`, {
            original: item.original.substring(0, 50),
          });
        }
        fallbackCount++;
      }

      return {
        ...item,
        translated:
          translatedText && translatedText.trim().length > 0 ? translatedText : item.original,
      };
    });

    if (isFinalAttempt && fallbackCount > 0) {
      logger.warn(
        `Batch translation: ${fallbackCount}/${batch.length} items fallback to original text`
      );
    }

    // Step 4: Build check result
    const checkResult: PostCheckResult = {
      isValid: fallbackCount === 0,
      issues:
        fallbackCount > 0
          ? [
              {
                type: 'corrupted_range' as const,
                affectedIds: missingItems.map((i) => String(i.id)),
                details: `${fallbackCount} translations missing`,
                retryable: fallbackCount < batch.length, // Retryable only if partial failure
              },
            ]
          : [],
      retryable: fallbackCount > 0 && fallbackCount < batch.length,
    };

    return { result, checkResult };
  };
}

// ===== Internal Helpers =====

import { type TimelineValidationResult } from '@/services/subtitle/timelineValidator';

interface PostCheckIssue {
  type: 'corrupted_range' | 'regression' | 'excessive_duration';
  affectedIds: string[];
  details: string;
  retryable: boolean;
}

function mapValidationToCheckResult(validation: TimelineValidationResult): PostCheckResult {
  const issues: PostCheckIssue[] = [];

  // Map corrupted ranges (retryable)
  for (const range of validation.corruptedRanges) {
    issues.push({
      type: 'corrupted_range',
      affectedIds: [],
      details: `Range ${range.startId} → ${range.endId} (${range.affectedCount} segments)`,
      retryable: true,
    });
  }

  // Map independent anomalies (not retryable)
  for (const anomaly of validation.independentAnomalies) {
    issues.push({
      type: anomaly.type === 'time_regression' ? 'regression' : 'excessive_duration',
      affectedIds: [anomaly.id],
      details: anomaly.details,
      retryable: false,
    });
  }

  return {
    isValid: validation.isValid,
    issues,
    retryable: validation.corruptedRanges.length > 0,
  };
}

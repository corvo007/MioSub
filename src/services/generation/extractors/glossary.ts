import { GoogleGenAI } from '@google/genai';
import {
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
  type GlossaryItem,
} from '@/types/glossary';
import { type TokenUsage } from '@/types/api';
import { blobToBase64 } from '@/services/audio/converter';
import { getAudioSegment } from '@/services/audio/audioSourceHelper';
import { mapInParallel } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import { createGlossarySchema } from '@/services/llm/schemas';
import {
  generateContentWithRetry,
  isRetryableError,
  getActionableErrorInfo,
} from '@/services/llm/providers/gemini';
import { GLOSSARY_EXTRACTION_PROMPT } from '@/services/llm/prompts';
import { STEP_MODELS, buildStepConfig } from '@/config';

export const extractGlossaryFromAudio = async (
  ai: GoogleGenAI,
  audioBuffer: AudioBuffer | null,
  chunks: { index: number; start: number; end: number }[],
  genre: string,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number, // Custom timeout in milliseconds
  targetLanguage?: string,
  // Long video mode parameters
  isLongVideo?: boolean,
  videoPath?: string
): Promise<GlossaryExtractionResult[]> => {
  logger.info(
    `Starting glossary extraction on ${chunks.length} chunks...${isLongVideo ? ' (long video mode)' : ''}`
  );

  // Track failed chunks for aggregated retry
  const failedChunks: { index: number; start: number; end: number }[] = [];
  let completed = 0;

  // Helper function to extract a single chunk with retry
  const extractSingleChunk = async (
    chunk: { index: number; start: number; end: number },
    attemptNumber: number = 1
  ): Promise<GlossaryExtractionResult> => {
    const { index, start, end } = chunk;

    try {
      const wavBlob = await getAudioSegment(
        { audioBuffer, videoPath, isLongVideo },
        start,
        end,
        'glossary extraction'
      );
      const base64Audio = await blobToBase64(wavBlob);
      const prompt = GLOSSARY_EXTRACTION_PROMPT(genre, targetLanguage);

      const terms = await generateContentWithRetry<GlossaryItem[]>(
        ai,
        {
          model: STEP_MODELS.glossaryExtraction,
          contents: {
            parts: [{ inlineData: { mimeType: 'audio/wav', data: base64Audio } }, { text: prompt }],
          },
          config: {
            responseSchema: createGlossarySchema(targetLanguage),
            ...buildStepConfig('glossaryExtraction'),
          },
        },
        3,
        signal,
        onUsage,
        timeoutMs,
        'array' // Parse JSON as array
      );

      const termCount = terms.length;
      logger.info(`[Chunk ${index}] Extracted ${termCount} terms (Attempt ${attemptNumber})`);

      return {
        terms: terms,
        source: 'chunk',
        chunkIndex: index,
        confidence: 'high',
      } as GlossaryExtractionResult;
    } catch (e: any) {
      const isRetryable = isRetryableError(e);

      // Retry logic: attempt up to 3 times total
      if (isRetryable && attemptNumber < 3) {
        const delay = Math.pow(2, attemptNumber) * 1000 + Math.random() * 500;
        logger.warn(
          `[Chunk ${index}] Extraction failed (${e.message}). Retrying in ${Math.round(delay)}ms... (Attempt ${attemptNumber + 1}/3)`,
          { error: e.message, status: e.status }
        );
        await new Promise((r) => setTimeout(r, delay));
        return extractSingleChunk(chunk, attemptNumber + 1);
      } else {
        // All retries exhausted or non-retryable error
        // Check for actionable error info to provide user-friendly feedback
        const actionableInfo = getActionableErrorInfo(e);
        const reason = isRetryable ? `after ${attemptNumber} attempts` : '(non-retryable error)';
        logger.error(`[Chunk ${index}] Extraction failed ${reason}`, {
          error: e.message,
          status: e.status,
        });

        // Throw with actionable message if available
        if (actionableInfo) {
          const enhancedError = new Error(actionableInfo.message);
          (enhancedError as any).status = e.status;
          (enhancedError as any).originalError = e;
          throw enhancedError;
        }
        throw e;
      }
    }
  };

  // ===== FIRST PASS: Process all chunks with chunk-level retry =====
  const results = await mapInParallel(
    chunks,
    concurrency,
    async (chunk) => {
      try {
        const result = await extractSingleChunk(chunk, 1);
        completed++;
        onProgress?.(completed, chunks.length);
        return result;
      } catch {
        // Record failed chunk for aggregated retry
        failedChunks.push(chunk);
        // Do NOT increment completed here, so UI doesn't show 100% yet
        // completed++;
        // onProgress?.(completed, chunks.length);

        return {
          terms: [],
          source: 'chunk',
          chunkIndex: chunk.index,
          confidence: 'low',
        } as GlossaryExtractionResult;
      }
    },
    signal
  );

  // ===== SECOND PASS: Aggregated retry for failed chunks =====
  if (failedChunks.length > 0) {
    if (signal?.aborted) {
      logger.info('Glossary extraction cancelled before retry pass');
      // Return what we have so far
      return results;
    }

    logger.warn(
      `First pass complete. ${failedChunks.length}/${chunks.length} chunks failed. Starting aggregated retry pass...`
    );

    // Use lower concurrency to reduce load and improve success rate
    const retryConcurrency = Math.max(1, Math.floor(concurrency / 2));

    await mapInParallel(
      failedChunks,
      retryConcurrency,
      async (failedChunk) => {
        try {
          logger.info(`[Chunk ${failedChunk.index}] Retry attempt (aggregated pass)`);
          const result = await extractSingleChunk(failedChunk, 1);

          // Update result in the results array
          const resultIndex = results.findIndex((r) => r.chunkIndex === failedChunk.index);
          if (resultIndex !== -1) {
            results[resultIndex] = result;
          }
          logger.info(`[Chunk ${failedChunk.index}] Aggregated retry succeeded!`);
        } catch (e: any) {
          logger.error(`[Chunk ${failedChunk.index}] Aggregated retry failed`, {
            error: e.message,
            status: e.status,
          });
        } finally {
          // Now mark this chunk as completed (success or fail)
          completed++;
          onProgress?.(completed, chunks.length);
        }
      },
      signal
    );
  }

  // ===== FINAL STATISTICS =====
  const successCount = results.filter((r) => r.confidence === 'high').length;
  const failCount = results.filter((r) => r.confidence === 'low' && r.terms.length === 0).length;
  const totalTerms = results.reduce((sum, r) => sum + r.terms.length, 0);

  logger.info(
    `Glossary extraction complete. Success: ${successCount}/${chunks.length}, Failed: ${failCount}/${chunks.length}, Total terms: ${totalTerms}`
  );

  return results;
};

export const retryGlossaryExtraction = async (
  apiKey: string,
  audioBuffer: AudioBuffer,
  chunks: { index: number; start: number; end: number }[],
  genre: string,
  concurrency: number,
  endpoint?: string,
  timeout?: number,
  targetLanguage?: string
): Promise<GlossaryExtractionMetadata> => {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(endpoint ? { baseUrl: endpoint } : {}),
      timeout: timeout || 600000,
    },
  });
  const results = await extractGlossaryFromAudio(
    ai,
    audioBuffer,
    chunks,
    genre,
    concurrency,
    undefined,
    undefined,
    undefined,
    timeout,
    targetLanguage
  );

  const totalTerms = results.reduce((sum, r) => sum + r.terms.length, 0);
  const hasFailures = results.some((r) => r.confidence === 'low' && r.terms.length === 0);

  return {
    results,
    totalTerms,
    hasFailures,
    glossaryChunks: chunks,
  };
};

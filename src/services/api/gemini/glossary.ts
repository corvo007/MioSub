import { GoogleGenAI } from "@google/genai";
import { GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from "@/types/glossary";
import { TokenUsage } from "@/types/api";
import { blobToBase64 } from "@/services/audio/converter";
import { sliceAudioBuffer } from "@/services/audio/processor";
import { mapInParallel } from "@/services/utils/concurrency";
import { logger } from "@/services/utils/logger";
import { GLOSSARY_SCHEMA, SAFETY_SETTINGS } from "./schemas";
import { generateContentWithRetry, isRetryableError } from "./client";
import { GLOSSARY_EXTRACTION_PROMPT } from "@/services/api/gemini/prompts";
import { extractJsonArray } from "@/services/subtitle/parser";

export const extractGlossaryFromAudio = async (
    ai: GoogleGenAI,
    audioBuffer: AudioBuffer,
    chunks: { index: number; start: number; end: number }[],
    genre: string,
    concurrency: number,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal,
    onUsage?: (usage: TokenUsage) => void,
    timeoutMs?: number // Custom timeout in milliseconds
): Promise<GlossaryExtractionResult[]> => {
    logger.info(`Starting glossary extraction on ${chunks.length} chunks...`);

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
            const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
            const base64Audio = await blobToBase64(wavBlob);
            const prompt = GLOSSARY_EXTRACTION_PROMPT(genre);

            const response = await generateContentWithRetry(ai, {
                model: 'gemini-3-pro-preview',
                contents: {
                    parts: [
                        { inlineData: { mimeType: "audio/wav", data: base64Audio } },
                        { text: prompt }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: GLOSSARY_SCHEMA,
                    safetySettings: SAFETY_SETTINGS,
                    maxOutputTokens: 65536,
                    tools: [{ googleSearch: {} }],
                }
            }, 3, signal, onUsage, timeoutMs);

            const text = response.text || "[]";
            const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const extracted = extractJsonArray(clean);
            const textToParse = extracted || clean;
            const terms = JSON.parse(textToParse);

            const termCount = Array.isArray(terms) ? terms.length : 0;
            logger.info(`[Chunk ${index}] Extracted ${termCount} terms (Attempt ${attemptNumber})`);

            return {
                terms: Array.isArray(terms) ? terms : [],
                source: 'chunk',
                chunkIndex: index,
                confidence: 'high'
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
                await new Promise(r => setTimeout(r, delay));
                return extractSingleChunk(chunk, attemptNumber + 1);
            } else {
                // All retries exhausted or non-retryable error
                const reason = isRetryable ? `在 ${attemptNumber} 次尝试后` : '(不可重试的错误)';
                logger.error(`[分段 ${index}] 提取失败 ${reason}`, { error: e.message, status: e.status });
                throw e;
            }
        }
    };

    // ===== FIRST PASS: Process all chunks with chunk-level retry =====
    const results = await mapInParallel(chunks, concurrency, async (chunk) => {
        try {
            const result = await extractSingleChunk(chunk, 1);
            completed++;
            onProgress?.(completed, chunks.length);
            return result;

        } catch (e) {
            // Record failed chunk for aggregated retry
            failedChunks.push(chunk);
            // Do NOT increment completed here, so UI doesn't show 100% yet
            // completed++; 
            // onProgress?.(completed, chunks.length);

            return {
                terms: [],
                source: 'chunk',
                chunkIndex: chunk.index,
                confidence: 'low'
            } as GlossaryExtractionResult;
        }
    }, signal);

    // ===== SECOND PASS: Aggregated retry for failed chunks =====
    if (failedChunks.length > 0) {
        if (signal?.aborted) {
            logger.info("Glossary extraction cancelled before retry pass");
            // Return what we have so far
            return results;
        }

        logger.warn(`First pass complete. ${failedChunks.length}/${chunks.length} chunks failed. Starting aggregated retry pass...`);

        // Use lower concurrency to reduce load and improve success rate
        const retryConcurrency = Math.max(1, Math.floor(concurrency / 2));

        await mapInParallel(failedChunks, retryConcurrency, async (failedChunk) => {
            try {
                logger.info(`[Chunk ${failedChunk.index}] Retry attempt (aggregated pass)`);
                const result = await extractSingleChunk(failedChunk, 1);

                // Update result in the results array
                const resultIndex = results.findIndex(r => r.chunkIndex === failedChunk.index);
                if (resultIndex !== -1) {
                    results[resultIndex] = result;
                }
                logger.info(`[Chunk ${failedChunk.index}] Aggregated retry succeeded!`);

            } catch (e: any) {
                logger.error(`[分块 ${failedChunk.index}] 聚合重试失败`, { error: e.message, status: e.status });
            } finally {
                // Now mark this chunk as completed (success or fail)
                completed++;
                onProgress?.(completed, chunks.length);
            }
        }, signal);
    }

    // ===== FINAL STATISTICS =====
    const successCount = results.filter(r => r.confidence === 'high').length;
    const failCount = results.filter(r => r.confidence === 'low' && r.terms.length === 0).length;
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
    timeout?: number
): Promise<GlossaryExtractionMetadata> => {
    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
            ...(endpoint ? { baseUrl: endpoint } : {}),
            timeout: timeout || 600000
        }
    });
    const results = await extractGlossaryFromAudio(ai, audioBuffer, chunks, genre, concurrency, undefined, undefined, undefined, timeout);

    const totalTerms = results.reduce((sum, r) => sum + r.terms.length, 0);
    const hasFailures = results.some(r => r.confidence === 'low' && r.terms.length === 0);

    return {
        results,
        totalTerms,
        hasFailures,
        glossaryChunks: chunks
    };
};



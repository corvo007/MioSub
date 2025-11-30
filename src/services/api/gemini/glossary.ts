import { GoogleGenAI, Type } from "@google/genai";
import { GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from "@/types/glossary";
import { SubtitleItem } from "@/types/subtitle";
import { blobToBase64 } from "@/services/audio/converter";
import { sliceAudioBuffer } from "@/services/audio/processor";
import { mapInParallel } from "@/services/utils/concurrency";
import { logger } from "@/services/utils/logger";
import { GLOSSARY_SCHEMA, SAFETY_SETTINGS } from "./schemas";
import { generateContentWithRetry, isRetryableError } from "./client";
import { GLOSSARY_EXTRACTION_PROMPT } from "@/prompts";

export const extractGlossaryFromAudio = async (
    ai: GoogleGenAI,
    audioBuffer: AudioBuffer,
    chunks: { index: number; start: number; end: number }[],
    genre: string,
    concurrency: number,
    onProgress?: (completed: number, total: number) => void
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
            });

            const text = response.text || "[]";
            const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const terms = JSON.parse(clean);

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
                const reason = isRetryable ? `after ${attemptNumber} attempts` : '(non-retryable error)';
                logger.error(`[Chunk ${index}] Extraction failed ${reason}`, { error: e.message, status: e.status });
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
            completed++;
            onProgress?.(completed, chunks.length);

            return {
                terms: [],
                source: 'chunk',
                chunkIndex: chunk.index,
                confidence: 'low'
            } as GlossaryExtractionResult;
        }
    });

    // ===== SECOND PASS: Aggregated retry for failed chunks =====
    if (failedChunks.length > 0) {
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
                logger.error(`[Chunk ${failedChunk.index}] Aggregated retry failed`, { error: e.message, status: e.status });
            }
        });
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
    const results = await extractGlossaryFromAudio(ai, audioBuffer, chunks, genre, concurrency);

    const totalTerms = results.reduce((sum, r) => sum + r.terms.length, 0);
    const hasFailures = results.some(r => r.confidence === 'low' && r.terms.length === 0);

    return {
        results,
        totalTerms,
        hasFailures,
        glossaryChunks: chunks
    };
};

/**
 * Auto-generate a glossary from the current subtitles.
 * Uses Gemini to identify key terms, names, and specialized vocabulary.
 */
export const generateGlossary = async (
    subtitles: SubtitleItem[],
    apiKey: string,
    genre: string,
    timeout?: number
): Promise<GlossaryItem[]> => {
    if (!apiKey) throw new Error("Gemini API Key is missing.");
    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: timeout || 600000 }
    });

    // Prepare a sample of the text to avoid context limit issues if the file is huge.
    // We'll take the first 200 lines, middle 100, and last 100 to get a good spread.
    let textSample = "";
    // Gemini context window is large (1M+ tokens), so we can process most subtitle files entirely.
    // We only sample if the file is extremely large (> 10,000 lines) to avoid timeouts.
    if (subtitles.length > 10000) {
        const start = subtitles.slice(0, 2000);
        const midIdx = Math.floor(subtitles.length / 2);
        const mid = subtitles.slice(midIdx, midIdx + 2000);
        const end = subtitles.slice(-2000);
        textSample = [...start, ...mid, ...end].map(s => s.original).join("\n");
    } else {
        textSample = subtitles.map(s => s.original).join("\n");
    }

    const prompt = `
    Task: Extract a glossary of key terms from the subtitle text.

      Context / Genre: ${genre}

    FOCUS AREAS:
    1. **Proper Names**: People, places, organizations.
    2. **Specialized Terminology**: Terms specific to this genre/context.
    3. **Recurring Terms**: Technical terms or slang appearing multiple times.

      RULES:
    1. **DEDUPLICATION**: Only list each unique term once. If a term appears multiple times, include it only once.
    2. **SIMPLIFIED CHINESE**: All translations MUST BE in Simplified Chinese (zh-CN).
    3. **RELEVANCE**: Only include terms important for consistent translation (not common words).
    4. **NOTES**: Use the "notes" field to clarify context if the term is ambiguous.
    5. **FINAL CHECK**: Verify all terms are unique, relevant, and translations are accurate.

    Text Sample:
    ${textSample}
    `;

    try {
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: GLOSSARY_SCHEMA,
                temperature: 1.0,
                maxOutputTokens: 65536,
                tools: [{ googleSearch: {} }],
            }
        });

        const text = response.text;
        if (!text) return [];
        return JSON.parse(text) as GlossaryItem[];
    } catch (e) {
        logger.error("Failed to generate glossary:", e);
        throw new Error("Failed to generate glossary. Please try again.");
    }
};

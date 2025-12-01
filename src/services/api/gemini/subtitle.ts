import { GoogleGenAI } from "@google/genai";
import { SubtitleItem } from "@/types/subtitle";
import { AppSettings } from "@/types/settings";
import { ChunkStatus } from "@/types/api";
import { GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from "@/types/glossary";
import { decodeAudioWithRetry } from "@/services/audio/decoder";
import { formatTime, timeToSeconds } from "@/services/subtitle/time";
import { SmartSegmenter } from "@/services/audio/segmenter";
import { selectChunksByDuration } from "@/services/glossary/selector";
import { extractGlossaryFromAudio } from "./glossary";
import { GlossaryState } from "./glossary-state";
import { sliceAudioBuffer } from "@/services/audio/processor";
import { transcribeAudio } from "@/services/api/openai/transcribe";
import { blobToBase64 } from "@/services/audio/converter";
import { getSystemInstruction } from "@/services/api/gemini/prompts";
import { parseGeminiResponse } from "@/services/subtitle/parser";
import { mapInParallel } from "@/services/utils/concurrency";
import { logger } from "@/services/utils/logger";
import { REFINEMENT_SCHEMA, SAFETY_SETTINGS } from "./schemas";
import { generateContentWithRetry } from "./client";
import { translateBatch } from "./batch";

import { getEnvVariable } from "@/services/utils/env";

export const generateSubtitles = async (
    file: File,
    duration: number,
    settings: AppSettings,
    onProgress?: (update: ChunkStatus) => void,
    onIntermediateResult?: (subs: SubtitleItem[]) => void,
    onGlossaryReady?: (metadata: GlossaryExtractionMetadata) => Promise<GlossaryItem[]>
): Promise<{ subtitles: SubtitleItem[], glossaryResults?: GlossaryExtractionResult[] }> => {

    const geminiKey = getEnvVariable('GEMINI_API_KEY') || settings.geminiKey?.trim();
    const openaiKey = getEnvVariable('OPENAI_API_KEY') || settings.openaiKey?.trim();

    if (!geminiKey) throw new Error("Gemini API Key is missing.");
    if (!openaiKey) throw new Error("OpenAI API Key is missing.");

    const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
            ...(settings.geminiEndpoint ? { baseUrl: settings.geminiEndpoint } : {}),
            timeout: (settings.requestTimeout || 600) * 1000 // Convert seconds to ms, default 600s if not set (UI defaults to 600)
        }
    });

    // 1. Decode Audio
    onProgress?.({ id: 'decoding', total: 1, status: 'processing', message: "正在解码音频..." });
    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await decodeAudioWithRetry(file);
        onProgress?.({ id: 'decoding', total: 1, status: 'completed', message: `音频解码完成。时长: ${formatTime(audioBuffer.duration)}` });
    } catch (e) {
        logger.error("Failed to decode audio", e);
        throw new Error("Failed to decode audio. Please ensure the file is a valid video/audio format.");
    }

    const totalDuration = audioBuffer.duration;
    const chunkDuration = settings.chunkDuration || 300;
    const totalChunks = Math.ceil(totalDuration / chunkDuration);

    // Prepare chunks
    const chunksParams: { index: number; start: number; end: number }[] = [];

    if (settings.useSmartSplit) {
        onProgress?.({ id: 'segmenting', total: 1, status: 'processing', message: "正在分析音频进行智能分割..." });
        const segmenter = new SmartSegmenter();
        const segments = await segmenter.segmentAudio(audioBuffer, chunkDuration);
        logger.info("Smart Segmentation Results", { count: segments.length, segments });

        segments.forEach((seg, i) => {
            chunksParams.push({
                index: i + 1,
                start: seg.start,
                end: seg.end
            });
        });
        onProgress?.({ id: 'segmenting', total: 1, status: 'completed', message: `智能分割创建了 ${segments.length} 个片段。` });
    } else {
        // Standard fixed-size chunking
        let cursor = 0;
        for (let i = 0; i < totalChunks; i++) {
            const end = Math.min(cursor + chunkDuration, totalDuration);
            chunksParams.push({
                index: i + 1,
                start: cursor,
                end: end
            });
            cursor += chunkDuration;
        }
        logger.info("Fixed Segmentation Results", { count: chunksParams.length, chunks: chunksParams });
    }


    const concurrency = settings.useLocalWhisper
        ? (settings.whisperConcurrency || 1)
        : (settings.concurrencyFlash || 5);

    // --- GLOSSARY EXTRACTION (Parallel) ---
    let glossaryPromise: Promise<GlossaryExtractionResult[]> | null = null;
    let glossaryChunks: { index: number; start: number; end: number }[] | undefined;

    if (settings.enableAutoGlossary !== false) {
        const sampleMinutes = settings.glossarySampleMinutes || 'all';
        glossaryChunks = selectChunksByDuration(chunksParams, sampleMinutes, chunkDuration);

        logger.info(`Initiating parallel glossary extraction on ${glossaryChunks.length} chunks (Limit: ${sampleMinutes} min)`);

        // Use Pro concurrency setting for glossary (Gemini 3 Pro)
        const glossaryConcurrency = settings.concurrencyPro || 2;

        onProgress?.({ id: 'glossary', total: glossaryChunks.length, status: 'processing', message: `正在提取术语 (0/${glossaryChunks.length})...` });

        glossaryPromise = extractGlossaryFromAudio(
            ai,
            audioBuffer,
            glossaryChunks,
            settings.genre,
            glossaryConcurrency,
            (completed, total) => {
                onProgress?.({
                    id: 'glossary',
                    total: total,
                    status: completed === total ? 'completed' : 'processing',
                    message: completed === total ? '术语提取完成。' : `正在提取术语 (${completed}/${total})...`
                });
            }
        );
    }

    // --- GLOSSARY HANDLING (Parallel to chunk processing) ---
    // Task: Extract glossary terms and wait for user confirmation
    let glossaryHandlingPromise: Promise<GlossaryItem[]>;
    let extractedGlossaryResults: GlossaryExtractionResult[] | undefined;

    if (glossaryPromise) {
        glossaryHandlingPromise = (async () => {
            let finalGlossary = settings.glossary || [];

            try {
                logger.info("Waiting for glossary extraction...");
                onProgress?.({ id: 'glossary', total: 1, status: 'processing', message: '正在提取术语表...' });

                extractedGlossaryResults = await glossaryPromise;

                // Calculate metadata for UI decision making
                const totalTerms = extractedGlossaryResults.reduce((sum, r) => sum + r.terms.length, 0);
                const hasFailures = extractedGlossaryResults.some(r => r.confidence === 'low' && r.terms.length === 0);

                if (onGlossaryReady && (totalTerms > 0 || hasFailures)) {
                    logger.info("Glossary extracted, waiting for user confirmation...", {
                        totalTerms,
                        hasFailures,
                        resultsCount: extractedGlossaryResults.length,
                        results: extractedGlossaryResults.map(r => ({ idx: r.chunkIndex, terms: r.terms.length, conf: r.confidence }))
                    });
                    onProgress?.({ id: 'glossary', total: 1, status: 'processing', message: '等待用户审核...' });

                    // BLOCKING CALL (User Interaction) - Pass metadata for UI
                    logger.info("Calling onGlossaryReady with metadata...");

                    const confirmationPromise = onGlossaryReady({
                        results: extractedGlossaryResults,
                        totalTerms,
                        hasFailures,
                        glossaryChunks: glossaryChunks!
                    });

                    // Wait indefinitely for user confirmation (no timeout)
                    finalGlossary = await confirmationPromise;
                    logger.info("onGlossaryReady returned.");

                    logger.info("Glossary confirmed/updated.", { count: finalGlossary.length });
                    onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: '术语表已应用。' });
                } else {
                    // No callback or truly empty results (not even failures)
                    logger.info("No glossary extraction needed", { totalTerms, hasFailures });
                    onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: '未发现术语。' });
                }
            } catch (e) {
                logger.warn("Glossary extraction failed or timed out", e);
                onProgress?.({ id: 'glossary', total: 1, status: 'error', message: '术语提取失败' });
            }

            return finalGlossary; // Return only the glossary, not a complex object
        })();
    } else {
        // No glossary extraction configured
        glossaryHandlingPromise = Promise.resolve(settings.glossary || []);
    }

    // Wrap glossary promise with GlossaryState for non-blocking access
    const glossaryState = new GlossaryState(glossaryHandlingPromise);
    logger.info("🔄 GlossaryState created - chunks can now access glossary independently");

    // --- UNIFIED PARALLEL PIPELINE: Transcription → Wait for Glossary → Refine & Translate ---
    // Each chunk proceeds independently without waiting for others
    logger.info("Starting Unified Pipeline: Each chunk will proceed independently");

    const chunkResults: SubtitleItem[][] = new Array(totalChunks).fill([]);

    await mapInParallel(chunksParams, concurrency, async (chunk, i) => {
        const { index, start, end } = chunk;

        try {
            // ===== STEP 1: TRANSCRIPTION =====
            onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'transcribing', message: '正在转录...' });
            logger.debug(`[Chunk ${index}] Starting transcription...`);

            const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
            const rawSegments = await transcribeAudio(
                wavBlob,
                openaiKey,
                settings.transcriptionModel,
                settings.openaiEndpoint,
                (settings.requestTimeout || 600) * 1000,
                settings.useLocalWhisper,
                settings.whisperModelPath,
                settings.whisperThreads
            );

            logger.debug(`[Chunk ${index}] Transcription complete. Segments: ${rawSegments.length}`);

            // Skip if no segments
            if (rawSegments.length === 0) {
                logger.warn(`[Chunk ${index}] No speech detected, skipping`);
                chunkResults[i] = [];
                onProgress?.({ id: index, total: totalChunks, status: 'completed', message: '完成 (空)' });
                return;
            }

            // ===== STEP 2: WAIT FOR GLOSSARY (Non-blocking for other chunks) =====
            onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'waiting_glossary', message: '等待术语表...' });
            logger.debug(`[Chunk ${index}] Waiting for glossary confirmation...`);

            const finalGlossary = await glossaryState.get();
            const chunkSettings = { ...settings, glossary: finalGlossary };

            logger.debug(`[Chunk ${index}] Glossary ready (${finalGlossary.length} terms), proceeding to refinement`);

            // ===== STEP 3: REFINEMENT =====
            // Re-slice audio for Gemini (Refine needs audio)
            const refineWavBlob = await sliceAudioBuffer(audioBuffer, start, end);
            const base64Audio = await blobToBase64(refineWavBlob);

            let refinedSegments: SubtitleItem[] = [];
            onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'refining', message: '正在校对时间轴...' });

            const refineSystemInstruction = getSystemInstruction(chunkSettings.genre, undefined, 'refinement', chunkSettings.glossary);
            // For refinement, only show original terms (without translations) to prevent language mixing
            const glossaryInfo = chunkSettings.glossary && chunkSettings.glossary.length > 0
                ? `\n\nKEY TERMINOLOGY (Listen for these terms in the audio and transcribe them accurately in the ORIGINAL LANGUAGE):\n${chunkSettings.glossary.map(g => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n')}`
                : '';

            const refinePrompt = `
        TRANSCRIPTION REFINEMENT TASK
        Context: ${chunkSettings.genre}

        TASK: Refine the raw OpenAI Whisper transcription by listening to the audio and correcting errors.

        RULES (Priority Order):

        [P1 - ACCURACY] Audio-Based Correction
        → Listen carefully to the attached audio
        → Fix misrecognized words and phrases in 'text'
        → Verify timing accuracy of 'start' and 'end' timestamps
        ${glossaryInfo ? `→ Pay special attention to key terminology listed below` : ''}

        [P2 - READABILITY] Segment Splitting
        → SPLIT any segment longer than 4 seconds OR >25 characters
        → When splitting: distribute timing based on actual audio speech
        → Ensure splits occur at natural speech breaks
        
        [P3 - CLEANING] Remove Non-Speech Elements
        → Remove filler words (uh, um, 呃, 嗯, etc.)
        → Remove stuttering and false starts
        → Keep natural speech flow

        [P4 - OUTPUT] Format Requirements
        → Return timestamps in HH:MM:SS,mmm format
        → Timestamps must be relative to the provided audio (starting at 00:00:00,000)
        → Ensure all required fields are present

        FINAL VERIFICATION:
        ✓ Long segments (>4s or >25 chars) properly split
        ✓ Timestamps are relative to chunk start
        ✓ Terminology from glossary is used correctly
        ${glossaryInfo ? `✓ Checked against ${chunkSettings.glossary?.length} glossary terms` : ''}

        Input Transcription (JSON):
        ${JSON.stringify(rawSegments.map(s => ({ start: s.startTime, end: s.endTime, text: s.original })))}
        `;

            try {
                const refineResponse = await generateContentWithRetry(ai, {
                    model: 'gemini-2.5-flash',
                    contents: {
                        parts: [
                            { inlineData: { mimeType: "audio/wav", data: base64Audio } },
                            { text: refinePrompt }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: REFINEMENT_SCHEMA,
                        systemInstruction: refineSystemInstruction,
                        safetySettings: SAFETY_SETTINGS,
                        maxOutputTokens: 65536,
                    }
                });

                refinedSegments = parseGeminiResponse(refineResponse.text, chunkDuration);

                if (refinedSegments.length === 0) {
                    refinedSegments = [...rawSegments];
                }
                logger.debug(`[Chunk ${index}] Refinement complete. Segments: ${refinedSegments.length}`);
            } catch (e) {
                logger.error(`Refinement failed for chunk ${index}, falling back to raw.`, e);
                refinedSegments = [...rawSegments];
            }

            // ===== STEP 4: TRANSLATION =====
            let finalChunkSubs: SubtitleItem[] = [];
            if (refinedSegments.length > 0) {
                onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'translating', message: '正在翻译...' });

                const toTranslate = refinedSegments.map((seg, idx) => ({
                    id: idx + 1,
                    original: seg.original,
                    start: seg.startTime,
                    end: seg.endTime
                }));

                const translateSystemInstruction = getSystemInstruction(chunkSettings.genre, chunkSettings.customTranslationPrompt, 'translation', chunkSettings.glossary);

                const translatedItems = await translateBatch(
                    ai,
                    toTranslate,
                    translateSystemInstruction,
                    concurrency,
                    chunkSettings.translationBatchSize || 20,
                    (update) => onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'translating', ...update })
                );
                logger.debug(`[Chunk ${index}] Translation complete. Items: ${translatedItems.length}`);

                finalChunkSubs = translatedItems.map(item => ({
                    id: 0, // Placeholder, will re-index later
                    startTime: formatTime(timeToSeconds(item.start) + start),
                    endTime: formatTime(timeToSeconds(item.end) + start),
                    original: item.original,
                    translated: item.translated
                }));
            }

            chunkResults[i] = finalChunkSubs;

            // Update Intermediate Result
            const currentAll = chunkResults.flat().map((s, idx) => ({ ...s, id: idx + 1 }));
            onIntermediateResult?.(currentAll);

            onProgress?.({ id: index, total: totalChunks, status: 'completed', message: '完成' });

        } catch (e) {
            logger.error(`Chunk ${index} failed`, e);
            onProgress?.({ id: index, total: totalChunks, status: 'error', message: '失败' });
        }
    });

    const finalSubtitles = chunkResults.flat().map((s, idx) => ({ ...s, id: idx + 1 }));
    return { subtitles: finalSubtitles, glossaryResults: extractedGlossaryResults };
};

import { GoogleGenAI, Part } from "@google/genai";
import { SubtitleItem, BatchOperationMode } from "@/types/subtitle";
import { AppSettings } from "@/types/settings";
import { ChunkStatus, TokenUsage } from "@/types/api";
import { parseGeminiResponse, extractJsonArray } from "@/services/subtitle/parser";
import { formatTime, timeToSeconds } from "@/services/subtitle/time";
import { decodeAudio } from "@/services/audio/decoder";
import { sliceAudioBuffer } from "@/services/audio/processor";
import { blobToBase64 } from "@/services/audio/converter";
import { mapInParallel } from "@/services/utils/concurrency";
import { logger } from "@/services/utils/logger";
import { getSystemInstructionWithDiarization } from "@/services/api/gemini/prompts";
import { SpeakerProfile } from "./speakerProfile";
import {
    TRANSLATION_SCHEMA,
    BATCH_SCHEMA,
    BATCH_WITH_DIARIZATION_SCHEMA,
    SAFETY_SETTINGS,
    PROOFREAD_BATCH_SIZE
} from "./schemas";
import {
    generateContentWithRetry,
    generateContentWithLongOutput,
    formatGeminiError
} from "./client";

export async function processTranslationBatchWithRetry(
    ai: GoogleGenAI,
    batch: any[],
    systemInstruction: string,
    maxRetries = 3,
    onStatusUpdate?: (update: { message?: string, toast?: { message: string, type: 'info' | 'warning' | 'error' | 'success' } }) => void,
    signal?: AbortSignal,
    onUsage?: (usage: TokenUsage) => void,
    timeoutMs?: number // Custom timeout in milliseconds
): Promise<any[]> {
    const payload = batch.map(item => ({ id: item.id, text: item.original, speaker: item.speaker }));

    const prompt = `
    TRANSLATION BATCH TASK
    
    TASK: Translate ${batch.length} subtitle segments to Simplified Chinese.
    
    RULES (Priority Order):
    
    [P1 - ACCURACY] Complete and Accurate Translation
    → Translate all ${batch.length} items (one-to-one mapping with input IDs)
    → Ensure no meaning is lost from source text
    → ID matching is critical - do not skip any ID
    → Output exactly ${batch.length} items in the response
    
    [P2 - QUALITY] Translation Excellence
    → Remove filler words and stuttering (uh, um, 呃, 嗯, etc.)
    → Produce fluent, natural Simplified Chinese
    → Use terminology from system instruction if provided
    → Maintain appropriate tone and style
    
    [P3 - OUTPUT] Format Requirements
    → 'text_translated' MUST BE in Simplified Chinese
    → Never output English, Japanese, or other languages in 'text_translated'
    → Maintain exact ID values from input
    
    FINAL VERIFICATION:
    ✓ All ${batch.length} IDs present in output
    ✓ All translations are Simplified Chinese
    ✓ No meaning lost from original text
    ✓ Filler words removed
    
    Input JSON:
    ${JSON.stringify(payload)}
    `;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await generateContentWithRetry(ai, {
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: TRANSLATION_SCHEMA,
                    systemInstruction: systemInstruction,
                    safetySettings: SAFETY_SETTINGS,
                    maxOutputTokens: 65536,
                }
            }, 3, signal, onUsage, timeoutMs);

            const text = response.text || "[]";
            let translatedData: any[] = [];
            try {
                const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
                const extracted = extractJsonArray(clean);
                const textToParse = extracted || clean;

                translatedData = JSON.parse(textToParse);
                if (!Array.isArray(translatedData) && (translatedData as any).items) translatedData = (translatedData as any).items;
            } catch (e) {
                logger.warn(`Translation JSON parse error (Attempt ${attempt + 1}/${maxRetries})`);
                throw e;
            }

            const transMap = new Map(translatedData.map((t: any) => [t.id, t.text_translated]));

            let fallbackCount = 0;
            const result = batch.map(item => {
                const translatedText = transMap.get(item.id);

                // Log missing translations
                if (!translatedText || translatedText.trim().length === 0) {
                    logger.warn(`Translation missing for ID ${item.id}, using original text`, {
                        original: item.original.substring(0, 50)
                    });
                    fallbackCount++;
                }

                return {
                    ...item,
                    translated: (translatedText && translatedText.trim().length > 0) ? translatedText : item.original
                };
            });

            // Summary log
            if (fallbackCount > 0) {
                logger.warn(`Batch translation: ${fallbackCount}/${batch.length} items fallback to original text`);
            }

            return result;

        } catch (e) {
            if (attempt < maxRetries - 1) {
                logger.warn(`Translation batch failed (Attempt ${attempt + 1}/${maxRetries}). Retrying entire batch...`, formatGeminiError(e));
                onStatusUpdate?.({
                    message: `正在重试 (${attempt + 1}/${maxRetries})...`,
                    toast: {
                        message: `批量翻译失败 (尝试 ${attempt + 1}/${maxRetries})。正在重试...`,
                        type: 'warning'
                    }
                });
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            } else {
                logger.error(`批量翻译在 ${maxRetries} 次尝试后失败`, formatGeminiError(e));
                onStatusUpdate?.({
                    toast: {
                        message: `批量翻译在 ${maxRetries} 次尝试后失败。将使用原文。`,
                        type: 'error'
                    }
                });
            }
        }
    }

    return batch.map(item => ({ ...item, translated: item.original }));
}

export async function translateBatch(
    ai: GoogleGenAI,
    items: any[],
    systemInstruction: string,
    concurrency: number,
    batchSize: number,
    onStatusUpdate?: (update: { message?: string, toast?: { message: string, type: 'info' | 'warning' | 'error' | 'success' } }) => void,
    signal?: AbortSignal,
    onUsage?: (usage: TokenUsage) => void,
    timeoutMs?: number // Custom timeout in milliseconds
): Promise<any[]> {
    const batches: any[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }

    const batchResults = await mapInParallel(batches, concurrency, async (batch) => {
        return await processTranslationBatchWithRetry(ai, batch, systemInstruction, 3, onStatusUpdate, signal, onUsage, timeoutMs);
    }, signal);

    return batchResults.flat();
}

async function processBatch(
    ai: GoogleGenAI,
    batch: SubtitleItem[],
    audioBuffer: AudioBuffer | null,
    lastEndTime: string,
    settings: AppSettings,
    systemInstruction: string,
    batchLabel: string,
    totalVideoDuration?: number,
    mode: BatchOperationMode = 'proofread',
    batchComment?: string,
    signal?: AbortSignal,
    onUsage?: (usage: TokenUsage) => void
): Promise<SubtitleItem[]> {
    if (batch.length === 0) return [];

    const batchStartStr = batch[0].startTime;
    const batchEndStr = batch[batch.length - 1].endTime;
    const startSec = timeToSeconds(batchStartStr);
    const endSec = timeToSeconds(batchEndStr);

    // Audio is required for both fix_timestamps and proofread modes.
    let base64Audio = "";

    let audioOffset = 0;
    if (audioBuffer) {
        try {
            if (startSec < endSec) {
                // Add padding to context (5 seconds before and after)
                audioOffset = Math.max(0, startSec - 5);
                const blob = await sliceAudioBuffer(audioBuffer, audioOffset, Math.min(audioBuffer.duration, endSec + 5));
                base64Audio = await blobToBase64(blob);
            }
        } catch (e) {
            logger.warn(`Audio slice failed for ${batchLabel}, falling back to text-only.`);
        }
    }

    const payload = batch.map(s => ({
        id: s.id,
        start: s.startTime,
        end: s.endTime,
        text_original: s.original,
        text_translated: s.translated,
        comment: s.comment, // Include user comment
        speaker: s.speaker // Include speaker for context and consistency
    }));

    let prompt = "";
    const hasBatchComment = batchComment && batchComment.trim().length > 0;
    const hasLineComments = batch.some(s => s.comment && s.comment.trim().length > 0);

    let specificInstruction = "";

    if (hasLineComments && !hasBatchComment) {
        // Case 1: Line Comments Only
        specificInstruction = `
    USER LINE INSTRUCTIONS:
    1. Specific lines have "comment" fields. You MUST strictly follow these manual corrections.
    2. CRITICAL: For lines WITHOUT comments, DO NOT MODIFY THEM. Preserve them exactly as is. Only change lines with comments.
    `;
    } else if (hasLineComments && hasBatchComment) {
        // Case 2: Line Comments AND Batch Comment
        specificInstruction = `
    USER INSTRUCTIONS:
    1. First, address the specific "comment" fields on individual lines.
    2. Second, apply this GLOBAL BATCH INSTRUCTION to the whole segment: "${batchComment}".
    3. You may modify any line to satisfy the global instruction or specific comments.
    `;
    } else if (hasBatchComment && !hasLineComments) {
        // Case 3: Batch Comment Only
        specificInstruction = `
    USER BATCH INSTRUCTION (Apply to ALL lines in this batch): "${batchComment}"
    `;
    }
    // Case 4: No Comments -> Default behavior (prompt below covers it)

    // Construct Glossary Context
    let glossaryContext = "";
    if (settings.glossary && settings.glossary.length > 0) {
        glossaryContext = `
    GLOSSARY (Strictly adhere to these terms):
    ${settings.glossary.map(g => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}
    `;
        logger.info(`[Batch ${batchLabel}] Using glossary with ${settings.glossary.length} terms.`);
    }


    if (mode === 'fix_timestamps') {
        prompt = `
    Batch ${batchLabel}.
    TIMESTAMP ALIGNMENT & SEGMENTATION TASK
    Previous batch ended at: "${lastEndTime}"
    ${glossaryContext}
    ${specificInstruction}

    TASK RULES (Priority Order):
    
    [P1 - PRIMARY] Perfect Timestamp Alignment
    → Listen to audio carefully
    → Align "start" and "end" to actual speech boundaries in audio
    → Timestamps MUST be relative to provided audio file (starting at 00:00:00)
    → Fix bunched-up or spread-out timing issues
    
    [P2 - MANDATORY] Segment Splitting for Readability
    → SPLIT any segment >4 seconds OR >25 Chinese characters
    → When splitting: distribute timing based on actual audio speech
    → Ensure splits occur at natural speech breaks
    
    [P3 - CONTENT] Audio Verification
    → If you hear speech NOT in the text → ADD new subtitle entries
    → Remove filler words from 'text_original' (uh, um, 呃, 嗯, etc.)
    
    [P4 - ABSOLUTE] Translation Preservation
    → DO NOT modify 'text_translated' under ANY circumstances
    → Even if it's English, wrong, or nonsensical → LEAVE IT
    → Translation is handled by Proofread function, not here
    
    FINAL VERIFICATION:
    ✓ All timestamps aligned to audio
    ✓ Long segments split appropriately  
    ✓ No missed speech
    ✓ 'text_translated' completely unchanged

    Input JSON:
    ${JSON.stringify(payload)}
        `;
    } else {
        // Proofread - Focus on TRANSLATION quality, may adjust timing when necessary
        prompt = `
    Batch ${batchLabel}.
    TRANSLATION QUALITY IMPROVEMENT TASK
    Previous batch ended at: "${lastEndTime}"
    Total video duration: ${totalVideoDuration ? formatTime(totalVideoDuration) : 'Unknown'}
    ${glossaryContext}
    ${specificInstruction}

    TASK RULES (Priority Order):
    
    [P1 - PRIMARY] Translation Quality Excellence
    → Fix mistranslations and missed meanings
    → Improve awkward or unnatural Chinese phrasing
    → Ensure ALL 'text_translated' are fluent Simplified Chinese (never English/Japanese/etc.)
    → Verify translation captures full intent of 'text_original'
    
    [P2 - CONTENT] Audio Content Verification
    → Listen to audio carefully
    → If you hear speech NOT in subtitles → ADD new subtitle entries
    → Verify 'text_original' matches what was actually said
    
    [P3 - ABSOLUTE] Timestamp Preservation
    → DO NOT modify timestamps of existing subtitles
    → Exception: When adding NEW entries for missed speech, assign appropriate timestamps
    → Even if existing lines are very long → LEAVE their timing unchanged
    → Your job is TRANSLATION quality, not timing adjustment
    
    [P4 - PRESERVATION] Default Behavior
    → For subtitles WITHOUT issues: preserve them as-is
    → Only modify when there's a clear translation quality problem
    
    FINAL VERIFICATION:
    ✓ All 'text_translated' are fluent Simplified Chinese
    ✓ No missed meaning from 'text_original'
    ✓ No missed speech from audio
    ✓ Translation quality significantly improved

    Current Subtitles JSON:
    ${JSON.stringify(payload)}
        `;
    }

    try {
        const parts: Part[] = [{ text: prompt }];
        if (base64Audio) {
            parts.push({
                inlineData: {
                    mimeType: "audio/wav",
                    data: base64Audio
                }
            });
        }

        // Model Selection:
        // Proofread -> Gemini 3 Pro (Best quality) + Search Grounding
        // Fix Timestamps / Retranslate -> Gemini 2.5 Flash (Fast/Efficient)
        const model = mode === 'proofread' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
        const tools = mode === 'proofread' ? [{ googleSearch: {} }] : undefined;

        // Use the new Long Output handler
        const text = await generateContentWithLongOutput(
            ai,
            model,
            systemInstruction,
            parts,
            settings.enableDiarization ? BATCH_WITH_DIARIZATION_SCHEMA : BATCH_SCHEMA, // Use strict schema if diarization enabled
            tools, // Enable Search Grounding for proofread
            signal,
            onUsage,
            (settings.requestTimeout || 600) * 1000 // Custom timeout in milliseconds
        );


        let processedBatch = parseGeminiResponse(text, totalVideoDuration);

        if (processedBatch.length > 0) {
            // Heuristic: Detect if Gemini returned relative timestamps (starting from ~0) or absolute
            // We explicitly asked for relative (0-based) in the prompt.
            // However, models sometimes ignore this and return absolute timestamps if the input had them.

            const firstStart = timeToSeconds(processedBatch[0].startTime);
            const expectedRelativeStart = 0; // We asked for 0-based
            const expectedAbsoluteStart = startSec; // The actual start time in the video

            const diffRelative = Math.abs(firstStart - expectedRelativeStart);
            const diffAbsolute = Math.abs(firstStart - expectedAbsoluteStart);

            // If the result is closer to 0 than to the absolute start, it's likely relative.
            // If audioOffset is 0 (start of video), diffRelative == diffAbsolute, so we don't need to add offset.
            if (audioOffset > 0 && diffRelative < diffAbsolute) {
                processedBatch = processedBatch.map(item => ({
                    ...item,
                    startTime: formatTime(timeToSeconds(item.startTime) + audioOffset),
                    endTime: formatTime(timeToSeconds(item.endTime) + audioOffset)
                }));
            }

            return processedBatch;
        }

        if (processedBatch.length > 0 && settings.enableDiarization) {
            logger.debug(`[Batch ${batchLabel}] Processed first item speaker: ${processedBatch[0].speaker}`);
        }
    } catch (e) {
        logger.error(`Batch ${batchLabel} processing failed (${mode}).`, e);
    }
    // Fallback: return original batch
    return batch;
}

import { getEnvVariable } from "@/services/utils/env";

export const runBatchOperation = async (
    file: File | null,
    allSubtitles: SubtitleItem[],
    batchIndices: number[], // 0-based indices of chunks
    settings: AppSettings,
    mode: BatchOperationMode,
    batchComments: Record<number, string> = {}, // Pass map of batch index -> comment
    onProgress?: (update: ChunkStatus) => void,
    signal?: AbortSignal,
    speakerProfiles?: SpeakerProfile[]
): Promise<SubtitleItem[]> => {
    const geminiKey = getEnvVariable('GEMINI_API_KEY') || settings.geminiKey?.trim();
    if (!geminiKey) throw new Error("缺少 API 密钥。");
    const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
            ...(settings.geminiEndpoint ? { baseUrl: settings.geminiEndpoint } : {}),
            timeout: (settings.requestTimeout || 600) * 1000
        }
    });

    let audioBuffer: AudioBuffer | null = null;
    // Both Proofread and Fix Timestamps need audio context.
    if (file) {
        onProgress?.({ id: 'init', total: 0, status: 'processing', message: "Loading audio..." });
        try {
            audioBuffer = await decodeAudio(file);
        } catch (e) {
            logger.warn("Audio decode failed, proceeding with text-only mode.", e);
        }
    } else {
        // If we are in Proofread mode but no file exists (SRT import), we fallback to text-only behavior inside processBatch (it handles null buffer)
        logger.info("No media file provided, running in text-only context.");
    }

    const systemInstruction = getSystemInstructionWithDiarization(
        settings.genre,
        mode === 'proofread' ? settings.customProofreadingPrompt : settings.customTranslationPrompt,
        mode,
        settings.glossary,
        settings.enableDiarization,  // Pass diarization flag
        speakerProfiles
    );

    const currentSubtitles = [...allSubtitles];
    const chunks: SubtitleItem[][] = [];
    const batchSize = settings.proofreadBatchSize || PROOFREAD_BATCH_SIZE;
    for (let i = 0; i < currentSubtitles.length; i += batchSize) {
        chunks.push(currentSubtitles.slice(i, i + batchSize));
    }

    const sortedIndices = [...batchIndices].sort((a, b) => a - b);

    // Group consecutive indices
    const groups: number[][] = [];

    // Exception: If ALL batches are selected, do NOT group them. Process individually.
    // This prevents sending the entire movie as one huge prompt which would definitely fail.
    const isSelectAll = sortedIndices.length === chunks.length;

    if (sortedIndices.length > 0) {
        if (isSelectAll) {
            // 1-on-1 mapping
            sortedIndices.forEach(idx => groups.push([idx]));
        } else {
            // Consecutive grouping logic
            let currentGroup = [sortedIndices[0]];
            for (let i = 1; i < sortedIndices.length; i++) {
                if (sortedIndices[i] === sortedIndices[i - 1] + 1) {
                    currentGroup.push(sortedIndices[i]);
                } else {
                    groups.push(currentGroup);
                    currentGroup = [sortedIndices[i]];
                }
            }
            groups.push(currentGroup);
        }
    }

    // Determine concurrency based on mode
    // Proofread uses Gemini 3 Pro (Low RPM) -> Concurrency PRO
    // Others use Gemini 2.5 Flash (High RPM) -> Concurrency FLASH
    const concurrency = mode === 'proofread' ? (settings.concurrencyPro || 2) : (settings.concurrencyFlash || 5);

    // Token Usage Tracking
    const usageReport: Record<string, { prompt: number, output: number, total: number }> = {};
    const trackUsage = (usage: TokenUsage) => {
        const model = usage.modelName;
        if (!usageReport[model]) {
            usageReport[model] = { prompt: 0, output: 0, total: 0 };
        }
        usageReport[model].prompt += usage.promptTokens;
        usageReport[model].output += usage.candidatesTokens;
        usageReport[model].total += usage.totalTokens;
    };

    await mapInParallel(groups, concurrency, async (group, i) => {
        const firstBatchIdx = group[0];

        // Merge batches in the group
        let mergedBatch: SubtitleItem[] = [];
        let mergedComment = "";

        group.forEach(idx => {
            if (idx < chunks.length) {
                const batch = chunks[idx];
                mergedBatch = [...mergedBatch, ...batch];

                if (batchComments[idx] && batch.length > 0) {
                    const rangeLabel = `[IDs ${batch[0].id}-${batch[batch.length - 1].id}]`;
                    mergedComment += (mergedComment ? " | " : "") + `${rangeLabel}: ${batchComments[idx]}`;
                }
            }
        });

        // Context for timestamps
        let lastEndTime = "00:00:00,000";
        if (firstBatchIdx > 0) {
            const prevChunk = chunks[firstBatchIdx - 1];
            if (prevChunk.length > 0) {
                lastEndTime = prevChunk[prevChunk.length - 1].endTime;
            }
        }

        let actionLabel = "";
        if (mode === 'proofread') actionLabel = "Polishing";
        else if (mode === 'fix_timestamps') actionLabel = "Aligning";
        else actionLabel = "Translating";

        const groupLabel = group.length > 1 ? `${group[0] + 1}-${group[group.length - 1] + 1}` : `${firstBatchIdx + 1}`;
        onProgress?.({ id: groupLabel, total: groups.length, status: 'processing', message: `${actionLabel}...` });
        logger.debug(`[Batch ${groupLabel}] Starting ${mode} operation. Merged items: ${mergedBatch.length}`);

        try {
            const processed = await processBatch(
                ai,
                mergedBatch,
                audioBuffer,
                lastEndTime,
                settings,
                systemInstruction,
                groupLabel,
                audioBuffer?.duration,
                mode,
                mergedComment,
                signal,
                trackUsage
            );

            // Update original subtitles with processed results
            // We need to map back by ID
            const processedMap = new Map(processed.map(p => [p.id, p]));

            // Update the chunks in the main array
            group.forEach(idx => {
                if (idx < chunks.length) {
                    const batch = chunks[idx];
                    for (let k = 0; k < batch.length; k++) {
                        const item = batch[k];
                        const updated = processedMap.get(item.id);
                        if (updated) {
                            // Find index in main array
                            const mainIndex = currentSubtitles.findIndex(s => s.id === item.id);
                            if (mainIndex !== -1) {
                                // Preserve speaker if not present in updated (e.g. proofread mode)
                                if (!updated.speaker && currentSubtitles[mainIndex].speaker) {
                                    updated.speaker = currentSubtitles[mainIndex].speaker;
                                }
                                currentSubtitles[mainIndex] = updated;
                            }
                        }
                    }
                }
            });

            onProgress?.({ id: groupLabel, total: groups.length, status: 'completed', message: "Done" });

        } catch (e) {
            logger.error(`Group ${groupLabel} failed`, e);
            onProgress?.({ id: groupLabel, total: groups.length, status: 'error', message: "Failed" });
            throw e; // Re-throw to stop mapInParallel if needed, or handle cancellation
        }
    }, signal);

    // Log Token Usage Report
    let reportLog = "\n📊 Token Usage Report (Batch Operation):\n----------------------------------------\n";
    let grandTotal = 0;
    for (const [model, usage] of Object.entries(usageReport)) {
        reportLog += `Model: ${model}\n`;
        reportLog += `  - Prompt Tokens: ${usage.prompt.toLocaleString()}\n`;
        reportLog += `  - Output Tokens: ${usage.output.toLocaleString()}\n`;
        reportLog += `  - Total: ${usage.total.toLocaleString()}\n`;
        reportLog += `----------------------------------------\n`;
        grandTotal += usage.total;
    }
    reportLog += `Grand Total: ${grandTotal.toLocaleString()}\n`;
    logger.info(reportLog);

    return currentSubtitles;
};

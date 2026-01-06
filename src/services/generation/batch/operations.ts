import { GoogleGenAI, type Part } from '@google/genai';
import i18n from '@/i18n';
import { type SubtitleItem, type BatchOperationMode } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type ChunkStatus, type TokenUsage } from '@/types/api';
import { parseGeminiResponse } from '@/services/subtitle/parser';
import { timeToSeconds, formatTime } from '@/services/subtitle/time';
import { reconcile } from '@/services/subtitle/reconciler';
import { toBatchPayload } from '@/services/subtitle/payloads';
import { decodeAudio } from '@/services/audio/decoder';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { blobToBase64 } from '@/services/audio/converter';
import { mapInParallel } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import {
  getSystemInstructionWithDiarization,
  getFixTimestampsPrompt,
  getProofreadPrompt,
} from '@/services/api/gemini/core/prompts';
import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import {
  BATCH_SCHEMA,
  BATCH_WITH_DIARIZATION_SCHEMA,
  PROOFREAD_BATCH_SIZE,
} from '@/services/api/gemini/core/schemas';
import { generateContentWithLongOutput } from '@/services/api/gemini/core/client';
import { STEP_MODELS, STEP_CONFIGS } from '@/config';
import { translateBatch } from '@/services/generation/pipeline/translation';
import { UsageReporter } from '@/services/generation/pipeline/usageReporter';
import { adjustTimestampOffset } from '@/services/generation/pipeline/resultTransformers';
import { ENV } from '@/config';

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
  let base64Audio = '';

  let audioOffset = 0;
  if (audioBuffer) {
    try {
      if (startSec < endSec) {
        // Add padding to context (5 seconds before and after)
        audioOffset = Math.max(0, startSec - 5);
        const blob = await sliceAudioBuffer(
          audioBuffer,
          audioOffset,
          Math.min(audioBuffer.duration, endSec + 5)
        );
        base64Audio = await blobToBase64(blob);
      }
    } catch (e) {
      logger.warn(`Audio slice failed for ${batchLabel}, falling back to text-only.`);
    }
  }

  // Convert timestamps to relative time (relative to audioOffset) for consistency with audio slice
  // This prevents AI confusion when processing audio that starts at a different time than absolute timestamps
  const payload = batch.map((s) => {
    const startTimeSec = timeToSeconds(s.startTime);
    const endTimeSec = timeToSeconds(s.endTime);
    // Convert to relative timestamps if we have audio offset
    const relativeStart = audioOffset > 0 ? formatTime(startTimeSec - audioOffset) : undefined;
    const relativeEnd = audioOffset > 0 ? formatTime(endTimeSec - audioOffset) : undefined;

    return toBatchPayload(s, relativeStart, relativeEnd);
  });

  let prompt = '';
  const hasBatchComment = batchComment && batchComment.trim().length > 0;
  const hasLineComments = batch.some((s) => s.comment && s.comment.trim().length > 0);

  let specificInstruction = '';

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
  const glossaryTerms = getActiveGlossaryTerms(settings);
  let glossaryContext = '';
  if (glossaryTerms.length > 0) {
    glossaryContext = `
    GLOSSARY (Strictly adhere to these terms):
    ${glossaryTerms.map((g) => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}
    `;
    logger.info(`[Batch ${batchLabel}] Using glossary with ${glossaryTerms.length} terms.`);
  }

  if (mode === 'fix_timestamps') {
    prompt = getFixTimestampsPrompt({
      batchLabel,
      lastEndTime,
      payload,
      glossaryContext,
      specificInstruction,
      conservativeMode: settings.conservativeBatchMode,
      targetLanguage: settings.targetLanguage,
    });
  } else {
    // Proofread - Focus on TRANSLATION quality, may adjust timing when necessary
    prompt = getProofreadPrompt({
      batchLabel,
      lastEndTime,
      totalVideoDuration,
      payload,
      glossaryContext,
      specificInstruction,
      targetLanguage: settings.targetLanguage,
    });
  }

  try {
    const parts: Part[] = [{ text: prompt }];
    if (base64Audio) {
      parts.push({
        inlineData: {
          mimeType: 'audio/wav',
          data: base64Audio,
        },
      });
    }

    // Model Selection:
    // Proofread -> Gemini 3 Pro (Best quality) + Search Grounding
    // Fix Timestamps / Retranslate -> Gemini Flash series model (Fast/Efficient)
    const model =
      mode === 'proofread' ? STEP_MODELS.batchProofread : STEP_MODELS.batchFixTimestamps;
    const stepConfig =
      mode === 'proofread' ? STEP_CONFIGS.batchProofread : STEP_CONFIGS.batchFixTimestamps;
    const tools = stepConfig.useSearch ? [{ googleSearch: {} }] : undefined;

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
      // Log diarization info before returning
      if (settings.enableDiarization) {
        logger.debug(
          `[Batch ${batchLabel}] Processed first item speaker: ${processedBatch[0].speaker}`
        );
      }
      // Adjust timestamp offset if needed (Gemini may return relative or absolute timestamps)
      processedBatch = adjustTimestampOffset(processedBatch, audioOffset, startSec);
      return processedBatch;
    }
  } catch (e) {
    logger.error(`Batch ${batchLabel} processing failed (${mode}).`, e);
  }
  // Fallback: return original batch
  return batch;
}

export const runBatchOperation = async (
  file: File | null,
  allSubtitles: SubtitleItem[],
  batchIndices: number[], // 0-based indices of chunks
  settings: AppSettings,
  mode: BatchOperationMode,
  batchComments: Record<string, string> = {}, // Pass map of batch index -> comment
  onProgress?: (update: ChunkStatus) => void,
  signal?: AbortSignal,
  speakerProfiles?: SpeakerProfile[]
): Promise<SubtitleItem[]> => {
  const geminiKey = ENV.GEMINI_API_KEY || settings.geminiKey?.trim();
  if (!geminiKey) throw new Error(i18n.t('services:pipeline.errors.missingGeminiKey'));
  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: {
      ...(settings.geminiEndpoint ? { baseUrl: settings.geminiEndpoint } : {}),
      timeout: (settings.requestTimeout || 600) * 1000,
    },
  });

  let audioBuffer: AudioBuffer | null = null;
  // Both Proofread and Fix Timestamps need audio context.
  if (file) {
    onProgress?.({
      id: 'init',
      total: 0,
      status: 'processing',
      message: i18n.t('services:pipeline.status.loadingAudio'),
    });
    try {
      audioBuffer = await decodeAudio(file);
    } catch (e) {
      logger.warn('Audio decode failed, proceeding with text-only mode.', e);
    }
  } else {
    // If we are in Proofread mode but no file exists (SRT import), we fallback to text-only behavior inside processBatch (it handles null buffer)
    logger.info('No media file provided, running in text-only context.');
  }

  const systemInstruction = getSystemInstructionWithDiarization(
    settings.genre,
    mode === 'proofread' ? settings.customProofreadingPrompt : settings.customTranslationPrompt,
    mode,
    getActiveGlossaryTerms(settings),
    settings.enableDiarization, // Pass diarization flag
    speakerProfiles,
    settings.minSpeakers,
    settings.maxSpeakers,
    settings.targetLanguage
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
      sortedIndices.forEach((idx) => groups.push([idx]));
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
  // Others use Gemini Flash series model (High RPM) -> Concurrency FLASH
  const concurrency =
    mode === 'proofread' ? settings.concurrencyPro || 2 : settings.concurrencyFlash || 5;

  // Token Usage Tracking
  const usageReporter = new UsageReporter();
  const trackUsage = usageReporter.getTracker();

  await mapInParallel(
    groups,
    concurrency,
    async (group, i) => {
      const firstBatchIdx = group[0];

      // Merge batches in the group
      let mergedBatch: SubtitleItem[] = [];
      let mergedComment = '';

      group.forEach((idx) => {
        if (idx < chunks.length) {
          const batch = chunks[idx];
          mergedBatch = [...mergedBatch, ...batch];

          if (batchComments[idx] && batch.length > 0) {
            const rangeLabel = `[IDs ${batch[0].id}-${batch[batch.length - 1].id}]`;
            mergedComment += (mergedComment ? ' | ' : '') + `${rangeLabel}: ${batchComments[idx]}`;
          }
        }
      });

      // Context for timestamps
      let lastEndTime = '00:00:00,000';
      if (firstBatchIdx > 0) {
        const prevChunk = chunks[firstBatchIdx - 1];
        if (prevChunk.length > 0) {
          lastEndTime = prevChunk[prevChunk.length - 1].endTime;
        }
      }

      let actionLabel = '';
      if (mode === 'proofread') actionLabel = i18n.t('services:pipeline.status.proofing');
      else if (mode === 'fix_timestamps')
        actionLabel = i18n.t('services:pipeline.status.fixingTimestamps');
      else actionLabel = i18n.t('services:pipeline.status.translating');

      const groupLabel =
        group.length > 1
          ? `${group[0] + 1}-${group[group.length - 1] + 1}`
          : `${firstBatchIdx + 1}`;
      onProgress?.({
        id: groupLabel,
        total: groups.length,
        status: 'processing',
        message: actionLabel,
      });
      logger.debug(
        `[Batch ${groupLabel}] Starting ${mode} operation. Merged items: ${mergedBatch.length}`
      );

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
        // Strategy: Replace the entire region covered by the original batch with processed results
        // This handles cases where AI splits, merges, or adds new subtitle entries

        // Find the range in currentSubtitles that corresponds to this batch
        const firstOriginalId = mergedBatch[0]?.id;
        const lastOriginalId = mergedBatch[mergedBatch.length - 1]?.id;

        if (firstOriginalId && lastOriginalId) {
          const startIdx = currentSubtitles.findIndex((s) => s.id === firstOriginalId);
          const endIdx = currentSubtitles.findIndex((s) => s.id === lastOriginalId);

          if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
            // Use reconcile to preserve metadata from original batch
            // Batch operations may split/merge, so don't preserve internal fields
            const originalBatch = currentSubtitles.slice(startIdx, endIdx + 1);
            const reconciledResults = reconcile(originalBatch, processed);

            // Replace the entire region [startIdx, endIdx] with processed results
            const itemsToRemove = endIdx - startIdx + 1;
            currentSubtitles.splice(startIdx, itemsToRemove, ...reconciledResults);

            logger.debug(
              `[Batch ${groupLabel}] Replaced ${itemsToRemove} items with ${processed.length} processed items`
            );
          } else {
            logger.warn(
              `[Batch ${groupLabel}] Could not find region to update. startIdx=${startIdx}, endIdx=${endIdx}`
            );
          }
        }

        onProgress?.({
          id: groupLabel,
          total: groups.length,
          status: 'completed',
          message: i18n.t('services:pipeline.status.completed'),
        });
      } catch (e) {
        logger.error(`Group ${groupLabel} failed`, e);
        onProgress?.({
          id: groupLabel,
          total: groups.length,
          status: 'error',
          message: i18n.t('services:pipeline.status.failed'),
        });
        throw e; // Re-throw to stop mapInParallel if needed, or handle cancellation
      }
    },
    signal
  );

  // Auto-translate entries with empty text_translated after fix_timestamps
  if (mode === 'fix_timestamps') {
    const emptyTranslationItems = currentSubtitles.filter(
      (s) => !s.translated || s.translated.trim() === ''
    );

    if (emptyTranslationItems.length > 0) {
      logger.info(
        `[Auto-Translate] Found ${emptyTranslationItems.length} entries with empty translations. Starting translation...`
      );
      onProgress?.({
        id: 'auto-translate',
        total: 1,
        status: 'processing',
        message: i18n.t('services:pipeline.status.translatingNew', {
          count: emptyTranslationItems.length,
        }),
      });

      try {
        const translationResults = await translateBatch(
          ai,
          emptyTranslationItems.map((item) => ({
            id: item.id,
            original: item.original,
            speaker: item.speaker,
          })),
          systemInstruction,
          settings.concurrencyFlash || 5,
          settings.translationBatchSize || 20,
          undefined,
          signal,
          trackUsage,
          (settings.requestTimeout || 600) * 1000,
          !!settings.enableDiarization,
          settings.targetLanguage
        );

        // Create a map of translations
        const transMap = new Map(translationResults.map((t: any) => [String(t.id), t.translated]));

        // Apply translations to currentSubtitles
        for (const sub of currentSubtitles) {
          const translation = transMap.get(sub.id);
          if (translation && (!sub.translated || sub.translated.trim() === '')) {
            sub.translated = translation;
          }
        }

        logger.info(
          `[Auto-Translate] Successfully translated ${translationResults.length} entries`
        );
        onProgress?.({
          id: 'auto-translate',
          total: 1,
          status: 'completed',
          message: i18n.t('services:pipeline.status.autoTranslationComplete'),
        });
      } catch (e) {
        logger.error('[Auto-Translate] Failed to translate new entries', e);
        onProgress?.({
          id: 'auto-translate',
          total: 1,
          status: 'error',
          message: i18n.t('services:pipeline.status.autoTranslationFailed'),
        });
        // Don't throw - allow the operation to complete with untranslated entries
      }
    }
  }

  // Log Token Usage Report
  usageReporter.logReport();

  return currentSubtitles;
};

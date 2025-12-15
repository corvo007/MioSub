import { GoogleGenAI } from '@google/genai';
import { SubtitleItem } from '@/types/subtitle';
import { generateSubtitleId } from '@/services/utils/id';
import { AppSettings } from '@/types/settings';
import { ChunkStatus, TokenUsage } from '@/types/api';
import {
  GlossaryItem,
  GlossaryExtractionResult,
  GlossaryExtractionMetadata,
} from '@/types/glossary';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';
import { SmartSegmenter } from '@/services/audio/segmenter';
import { selectChunksByDuration } from '@/services/glossary/selector';
import { extractGlossaryFromAudio } from '@/services/api/gemini/glossary';
import { GlossaryState } from '@/services/api/gemini/glossary-state';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { transcribeAudio } from '@/services/api/openai/transcribe';
import { blobToBase64 } from '@/services/audio/converter';
import { intelligentAudioSampling } from '@/services/audio/sampler';
import { extractSpeakerProfiles, SpeakerProfile } from '@/services/api/gemini/speakerProfile';
import {
  getSystemInstruction,
  getSystemInstructionWithDiarization,
  getRefinementPrompt,
} from '@/services/api/gemini/prompts';
import { parseGeminiResponse, cleanNonSpeechAnnotations } from '@/services/subtitle/parser';
import { mapInParallel, Semaphore } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import { calculateDetailedCost } from '@/services/api/gemini/pricing';
import {
  REFINEMENT_SCHEMA,
  REFINEMENT_WITH_DIARIZATION_SCHEMA,
  SAFETY_SETTINGS,
} from '@/services/api/gemini/schemas';
import {
  generateContentWithRetry,
  formatGeminiError,
  getActionableErrorMessage,
} from '@/services/api/gemini/client';
import { translateBatch } from '@/services/api/gemini/batch';
import { MODELS, ENV } from '@/config';

export const generateSubtitles = async (
  audioSource: File | AudioBuffer,
  duration: number,
  settings: AppSettings,
  onProgress?: (update: ChunkStatus) => void,
  onIntermediateResult?: (subs: SubtitleItem[]) => void,
  onGlossaryReady?: (metadata: GlossaryExtractionMetadata) => Promise<GlossaryItem[]>,
  signal?: AbortSignal
): Promise<{ subtitles: SubtitleItem[]; glossaryResults?: GlossaryExtractionResult[] }> => {
  const geminiKey = ENV.GEMINI_API_KEY || settings.geminiKey?.trim();
  const openaiKey = ENV.OPENAI_API_KEY || settings.openaiKey?.trim();

  if (!geminiKey) throw new Error('缺少 Gemini API 密钥。');
  if (!openaiKey && !settings.useLocalWhisper) throw new Error('缺少 OpenAI API 密钥。');

  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: {
      ...(settings.geminiEndpoint ? { baseUrl: settings.geminiEndpoint } : {}),
      timeout: (settings.requestTimeout || 600) * 1000, // Convert seconds to ms, default 600s if not set (UI defaults to 600)
    },
  });

  // Token Usage Tracking with modality breakdown
  const usageReport: Record<
    string,
    {
      prompt: number;
      output: number;
      total: number;
      textInput: number;
      audioInput: number;
      thoughts: number;
    }
  > = {};
  const trackUsage = (usage: TokenUsage) => {
    const model = usage.modelName;
    if (!usageReport[model]) {
      usageReport[model] = {
        prompt: 0,
        output: 0,
        total: 0,
        textInput: 0,
        audioInput: 0,
        thoughts: 0,
      };
    }
    usageReport[model].prompt += usage.promptTokens;
    usageReport[model].output += usage.candidatesTokens;
    usageReport[model].total += usage.totalTokens;
    usageReport[model].textInput += usage.textInputTokens || 0;
    usageReport[model].audioInput += usage.audioInputTokens || 0;
    usageReport[model].thoughts += usage.thoughtsTokens || 0;
  };

  // 1. Decode Audio
  onProgress?.({ id: 'decoding', total: 1, status: 'processing', message: '正在解码音频...' });
  let audioBuffer: AudioBuffer;
  try {
    if (audioSource instanceof AudioBuffer) {
      audioBuffer = audioSource;
      onProgress?.({
        id: 'decoding',
        total: 1,
        status: 'completed',
        message: `使用缓存音频，时长: ${formatTime(audioBuffer.duration)}`,
      });
    } else {
      audioBuffer = await decodeAudioWithRetry(audioSource);
      onProgress?.({
        id: 'decoding',
        total: 1,
        status: 'completed',
        message: `解码完成，时长: ${formatTime(audioBuffer.duration)}`,
      });
    }
  } catch (e) {
    logger.error('Failed to decode audio', e);
    throw new Error('音频解码失败，请确保文件是有效的视频或音频格式。');
  }

  const totalDuration = audioBuffer.duration;
  const chunkDuration = settings.chunkDuration || 300;
  const totalChunks = Math.ceil(totalDuration / chunkDuration);

  // Prepare chunks
  const chunksParams: { index: number; start: number; end: number }[] = [];
  let vadSegments: { start: number; end: number }[] | undefined; // Cache VAD segments

  if (settings.useSmartSplit) {
    onProgress?.({ id: 'segmenting', total: 1, status: 'processing', message: '正在智能分段...' });
    const segmenter = new SmartSegmenter();
    const result = await segmenter.segmentAudio(audioBuffer, chunkDuration, signal);
    logger.info('Smart Segmentation Results', {
      count: result.chunks.length,
      chunks: result.chunks,
    });

    result.chunks.forEach((seg, i) => {
      chunksParams.push({
        index: i + 1,
        start: seg.start,
        end: seg.end,
      });
    });

    // Cache VAD segments for reuse in speaker sampling
    vadSegments = result.vadSegments;
    logger.info(`Cached ${vadSegments.length} VAD segments for speaker profile extraction`);

    onProgress?.({
      id: 'segmenting',
      total: 1,
      status: 'completed',
      message: `智能分段完成，共 ${result.chunks.length} 个片段。`,
    });
  } else {
    // Standard fixed-size chunking
    let cursor = 0;
    for (let i = 0; i < totalChunks; i++) {
      const end = Math.min(cursor + chunkDuration, totalDuration);
      chunksParams.push({
        index: i + 1,
        start: cursor,
        end: end,
      });
      cursor += chunkDuration;
    }
    logger.info('Fixed Segmentation Results', { count: chunksParams.length, chunks: chunksParams });
  }

  // PIPELINE CONCURRENCY CONFIGURATION
  // We separate the "Transcription" concurrency from the "Overall Pipeline" concurrency.
  // This allows chunks to proceed to Refinement/Translation (which use Gemini)
  // even if the Transcription slot (Local Whisper) is busy or waiting.

  // 1. Overall Pipeline Concurrency (Gemini Flash limit)
  const pipelineConcurrency = settings.concurrencyFlash || 5;

  // 2. Transcription Concurrency (Local Whisper limit or Cloud limit)
  const transcriptionLimit = settings.useLocalWhisper
    ? settings.whisperConcurrency || 1
    : pipelineConcurrency; // For cloud whisper, we can match pipeline concurrency

  const transcriptionSemaphore = new Semaphore(transcriptionLimit);
  const refinementSemaphore = new Semaphore(pipelineConcurrency);

  logger.info(
    `Pipeline Config: Overall Concurrency=${pipelineConcurrency}, Transcription Limit=${transcriptionLimit}`
  );

  // --- GLOSSARY EXTRACTION (Parallel) ---
  let glossaryPromise: Promise<GlossaryExtractionResult[]> | null = null;
  let glossaryChunks: { index: number; start: number; end: number }[] | undefined;

  const isDebug = window.electronAPI?.isDebug;

  if (isDebug && settings.debug?.mockGemini) {
    const mockGlossary = [
      {
        chunkIndex: 0,
        terms: [
          {
            term: 'Mock Term',
            translation: '模拟术语',
            category: 'Mock Category',
            confidence: 'high',
          } as any,
        ],
        confidence: 'high',
        source: 'chunk',
      },
    ];
    logger.info('⚠️ [MOCK] Glossary Extraction ENABLED. Returning mock data:', mockGlossary);
    glossaryPromise = Promise.resolve(mockGlossary as any);
  } else if (settings.enableAutoGlossary !== false) {
    const sampleMinutes = settings.glossarySampleMinutes || 'all';
    glossaryChunks = selectChunksByDuration(chunksParams, sampleMinutes, chunkDuration);

    logger.info(
      `Initiating parallel glossary extraction on ${glossaryChunks.length} chunks (Limit: ${sampleMinutes} min)`
    );

    // Use Pro concurrency setting for glossary (Gemini 3 Pro)
    const glossaryConcurrency = settings.concurrencyPro || 2;

    onProgress?.({
      id: 'glossary',
      total: glossaryChunks.length,
      status: 'processing',
      message: `正在提取术语 (0/${glossaryChunks.length})...`,
    });

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
          message:
            completed === total ? '术语提取完成。' : `正在提取术语 (${completed}/${total})...`,
        });
      },
      signal,
      trackUsage,
      (settings.requestTimeout || 600) * 1000 // Custom timeout in milliseconds
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
        logger.info('Waiting for glossary extraction...');
        onProgress?.({
          id: 'glossary',
          total: 1,
          status: 'processing',
          message: '正在提取术语...',
        });

        extractedGlossaryResults = await glossaryPromise;

        // Calculate metadata for UI decision making
        const totalTerms = extractedGlossaryResults.reduce((sum, r) => sum + r.terms.length, 0);
        const hasFailures = extractedGlossaryResults.some(
          (r) => r.confidence === 'low' && r.terms.length === 0
        );

        if (onGlossaryReady && (totalTerms > 0 || hasFailures)) {
          logger.info('Glossary extracted, waiting for user confirmation...', {
            totalTerms,
            hasFailures,
            resultsCount: extractedGlossaryResults.length,
            results: extractedGlossaryResults.map((r) => ({
              idx: r.chunkIndex,
              terms: r.terms.length,
              conf: r.confidence,
            })),
          });
          onProgress?.({
            id: 'glossary',
            total: 1,
            status: 'processing',
            message: '等待用户确认...',
          });

          // BLOCKING CALL (User Interaction) - Pass metadata for UI
          logger.info('Calling onGlossaryReady with metadata...');

          const confirmationPromise = onGlossaryReady({
            results: extractedGlossaryResults,
            totalTerms,
            hasFailures,
            glossaryChunks: glossaryChunks!,
          });

          // Wait indefinitely for user confirmation (no timeout)
          finalGlossary = await confirmationPromise;
          logger.info('onGlossaryReady returned.');

          logger.info('Glossary confirmed/updated.', { count: finalGlossary.length });
          onProgress?.({
            id: 'glossary',
            total: 1,
            status: 'completed',
            message: '术语表已应用。',
          });
        } else {
          // No callback or truly empty results (not even failures)
          logger.info('No glossary extraction needed', { totalTerms, hasFailures });
          onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: '未发现术语。' });
        }
      } catch (e: any) {
        if (e.message === '操作已取消' || e.name === 'AbortError') {
          logger.info('Glossary extraction cancelled');
          onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: '已取消' });
        } else {
          logger.warn('Glossary extraction failed or timed out', e);
          // Use actionable error message if available, otherwise generic message
          const actionableMsg = getActionableErrorMessage(e);
          const errorMsg = actionableMsg || '术语提取失败';
          onProgress?.({ id: 'glossary', total: 1, status: 'error', message: errorMsg });
        }
      }

      return finalGlossary; // Return only the glossary, not a complex object
    })();
  } else {
    // No glossary extraction configured
    glossaryHandlingPromise = Promise.resolve(settings.glossary || []);
  }

  // Wrap glossary promise with GlossaryState for non-blocking access
  const glossaryState = new GlossaryState(glossaryHandlingPromise);
  logger.info('🔄 GlossaryState created - chunks can now access glossary independently');

  // --- SPEAKER PROFILE EXTRACTION (Parallel) ---
  let speakerProfilePromise: Promise<SpeakerProfile[]> | null = null;
  // Only run pre-analysis if both Diarization AND Pre-analysis are enabled
  if (settings.enableDiarization && settings.enableSpeakerPreAnalysis) {
    logger.info('Starting parallel speaker profile extraction...');
    onProgress?.({
      id: 'diarization',
      total: 1,
      status: 'processing',
      message: '正在分析说话人...',
    });

    speakerProfilePromise = (async () => {
      try {
        // 1. Intelligent Sampling (returns blob and duration)
        const { blob: sampledAudioBlob, duration } = await intelligentAudioSampling(
          audioBuffer,
          480, // 8 minutes for comprehensive speaker coverage
          8,
          signal,
          vadSegments // Pass cached VAD segments to avoid re-running VAD
        );

        // 2. Extract Profiles
        const profileSet = await extractSpeakerProfiles(
          ai,
          sampledAudioBlob,
          duration,
          settings.genre,
          (settings.requestTimeout || 600) * 1000, // Use configured timeout
          trackUsage,
          signal,
          settings.minSpeakers,
          settings.maxSpeakers
        );

        logger.info(
          `Extracted ${profileSet.profiles.length} speaker profiles`,
          profileSet.profiles
        );
        onProgress?.({
          id: 'diarization',
          total: 1,
          status: 'completed',
          message: `已识别 ${profileSet.profiles.length} 位说话人`,
        });

        // Swap ID with Name if available, so the AI uses the name in the output
        return profileSet.profiles.map((p) => ({
          ...p,
          id: p.characteristics.name || p.id,
        }));
      } catch (e: any) {
        logger.error('Speaker profile extraction failed', e);
        // Use actionable error message if available
        const actionableMsg = getActionableErrorMessage(e);
        const errorMsg = actionableMsg || '说话人分析失败';
        onProgress?.({ id: 'diarization', total: 1, status: 'error', message: errorMsg });
        return [];
      }
    })();
  }

  // --- UNIFIED PARALLEL PIPELINE: Transcription → Wait for Glossary/Profiles → Refine & Translate ---
  // Each chunk proceeds independently without waiting for others
  logger.info('Starting Unified Pipeline: Each chunk will proceed independently');

  const chunkResults: SubtitleItem[][] = new Array(totalChunks).fill([]);

  // Use a high concurrency limit for the main loop (buffer)
  // The actual resource usage is controlled by semaphores inside
  // We use totalChunks to ensure all chunks can enter the "waiting room" (semaphore queue)
  // preventing the pipeline from stalling due to loop limits.
  const mainLoopConcurrency = Math.max(totalChunks, pipelineConcurrency, 20);

  await mapInParallel(chunksParams, mainLoopConcurrency, async (chunk, i) => {
    const { index, start, end } = chunk;

    try {
      // ===== STEP 1: TRANSCRIPTION =====
      onProgress?.({
        id: index,
        total: totalChunks,
        status: 'processing',
        stage: 'transcribing',
        message: '等待转录...',
      });

      let rawSegments: SubtitleItem[] = [];

      // Acquire Transcription Semaphore
      await transcriptionSemaphore.acquire();
      try {
        if (signal?.aborted) throw new Error('操作已取消');

        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'processing',
          stage: 'transcribing',
          message: '正在转录...',
        });
        logger.debug(`[Chunk ${index}] Starting transcription...`);

        const shouldMockTranscription =
          isDebug &&
          (settings.useLocalWhisper
            ? settings.debug?.mockLocalWhisper
            : settings.debug?.mockOpenAI);

        if (shouldMockTranscription) {
          const mockTranscription = [
            {
              id: generateSubtitleId(),
              startTime: '00:00:00,000',
              endTime: formatTime(end - start),
              original: `[Mock] Transcription for Chunk ${index}`,
              translated: '',
            },
          ];
          logger.info(
            `⚠️ [MOCK] Transcription ENABLED for Chunk ${index}. Returning mock data:`,
            mockTranscription
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          rawSegments = mockTranscription;
        } else {
          const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
          rawSegments = await transcribeAudio(
            wavBlob,
            openaiKey,
            settings.transcriptionModel,
            settings.openaiEndpoint,
            (settings.requestTimeout || 600) * 1000,
            settings.useLocalWhisper,
            settings.whisperModelPath,
            settings.whisperThreads,
            signal,
            settings.debug?.whisperPath
          );
        }
      } finally {
        transcriptionSemaphore.release();
      }

      logger.debug(`[Chunk ${index}] Transcription complete. Segments: ${rawSegments.length}`);

      // Clean non-speech annotations (e.g., "(laughter)", "[MUSIC]")
      rawSegments = rawSegments
        .map((seg) => ({
          ...seg,
          original: cleanNonSpeechAnnotations(seg.original),
        }))
        .filter((seg) => seg.original.length > 0);

      // Skip if no segments (after cleaning)
      if (rawSegments.length === 0) {
        logger.warn(`[Chunk ${index}] No speech detected, skipping`);
        chunkResults[i] = [];
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: '完成（无内容）',
        });
        return;
      }

      // ===== STEP 2: WAIT FOR GLOSSARY (Non-blocking for other chunks) =====
      onProgress?.({
        id: index,
        total: totalChunks,
        status: 'processing',
        stage: 'waiting_glossary',
        message: '等待术语表...',
      });
      logger.debug(`[Chunk ${index}] Waiting for glossary confirmation...`);

      if (signal?.aborted) throw new Error('操作已取消');

      const finalGlossary = await glossaryState.get();

      if (signal?.aborted) throw new Error('操作已取消');

      const chunkSettings = { ...settings, glossary: finalGlossary };

      logger.debug(
        `[Chunk ${index}] Glossary ready (${finalGlossary.length} terms), proceeding to refinement`
      );

      // Wait for speaker profiles if diarization is enabled (Before acquiring semaphore)
      let speakerProfiles: SpeakerProfile[] | undefined;
      if (speakerProfilePromise) {
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'processing',
          stage: 'waiting_speakers',
          message: '等待说话人分析...',
        });
        try {
          // Race with signal to ensure immediate response even if promise hangs
          if (signal) {
            speakerProfiles = await Promise.race([
              speakerProfilePromise,
              new Promise<never>((_, reject) => {
                if (signal.aborted) reject(new Error('Operation cancelled'));
                else
                  signal.addEventListener('abort', () => reject(new Error('Operation cancelled')));
              }),
            ]);
          } else {
            speakerProfiles = await speakerProfilePromise;
          }
        } catch (e) {
          if (signal?.aborted) throw new Error('操作已取消');
          logger.warn('Failed to get speaker profiles, proceeding without them', e);
        }
      }

      // ===== STEP 3: REFINEMENT =====
      // Acquire Refinement Semaphore (Gemini API limit)
      await refinementSemaphore.acquire();
      try {
        if (signal?.aborted) throw new Error('操作已取消');

        // Re-slice audio for Gemini (Refine needs audio)
        const refineWavBlob = await sliceAudioBuffer(audioBuffer, start, end);
        const base64Audio = await blobToBase64(refineWavBlob);

        let refinedSegments: SubtitleItem[] = [];
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'processing',
          stage: 'refining',
          message: '正在校对时间轴...',
        });

        const refineSystemInstruction = getSystemInstructionWithDiarization(
          chunkSettings.genre,
          undefined,
          'refinement',
          chunkSettings.glossary,
          chunkSettings.enableDiarization,
          speakerProfiles,
          chunkSettings.minSpeakers,
          chunkSettings.maxSpeakers
        );
        // For refinement, only show original terms (without translations) to prevent language mixing
        const glossaryInfo =
          chunkSettings.glossary && chunkSettings.glossary.length > 0
            ? `\n\nKEY TERMINOLOGY (Listen for these terms in the audio and transcribe them accurately in the ORIGINAL LANGUAGE):\n${chunkSettings.glossary.map((g) => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n')}`
            : '';

        const refinePrompt = getRefinementPrompt({
          genre: chunkSettings.genre,
          rawSegments,
          glossaryInfo,
          glossaryCount: chunkSettings.glossary?.length,
          enableDiarization: chunkSettings.enableDiarization,
        });

        try {
          if (isDebug && settings.debug?.mockGemini) {
            logger.info(
              `⚠️ [MOCK] Refinement ENABLED for Chunk ${index}. Returning raw segments as refined.`
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
            refinedSegments = [...rawSegments];
          } else {
            const refineResponse = await generateContentWithRetry(
              ai,
              {
                model: MODELS.FLASH,
                contents: {
                  parts: [
                    { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
                    { text: refinePrompt },
                  ],
                },
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: chunkSettings.enableDiarization
                    ? REFINEMENT_WITH_DIARIZATION_SCHEMA
                    : REFINEMENT_SCHEMA,
                  systemInstruction: refineSystemInstruction,
                  safetySettings: SAFETY_SETTINGS,
                  maxOutputTokens: 65536,
                },
              },
              3,
              signal,
              trackUsage,
              (settings.requestTimeout || 600) * 1000
            );

            refinedSegments = parseGeminiResponse(refineResponse.text, chunkDuration);
          }

          if (refinedSegments.length === 0) {
            refinedSegments = [...rawSegments];
          }
          logger.debug(`[Chunk ${index}] Refinement complete. Segments: ${refinedSegments.length}`);
          if (refinedSegments.length > 0 && chunkSettings.enableDiarization) {
            logger.debug(
              `[Chunk ${index}] Refinement first segment speaker: ${refinedSegments[0].speaker}`
            );
          }
        } catch (e) {
          logger.error(`分段 ${index} 时间轴失败，将回退到原始结果。`, formatGeminiError(e));
          refinedSegments = [...rawSegments];
        }

        // ===== STEP 4: TRANSLATION =====
        let finalChunkSubs: SubtitleItem[] = [];
        if (refinedSegments.length > 0) {
          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'processing',
            stage: 'translating',
            message: '正在翻译...',
          });

          const toTranslate = refinedSegments.map((seg, idx) => ({
            id: seg.id,
            original: seg.original,
            start: seg.startTime,
            end: seg.endTime,
            speaker: seg.speaker,
          }));

          // Pass speaker profiles to translation only if useSpeakerStyledTranslation is enabled
          const profilesForTranslation =
            chunkSettings.useSpeakerStyledTranslation && speakerProfiles
              ? speakerProfiles
              : undefined;
          const translateSystemInstruction = getSystemInstruction(
            chunkSettings.genre,
            chunkSettings.customTranslationPrompt,
            'translation',
            chunkSettings.glossary,
            profilesForTranslation
          );

          let translatedItems: any[] = [];
          if (isDebug && settings.debug?.mockGemini) {
            logger.info(
              `⚠️ [MOCK] Translation ENABLED for Chunk ${index}. Generating mock translations.`
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
            translatedItems = toTranslate.map((t) => ({
              ...t,
              translated: `[Mock] Translated: ${t.original}`,
            }));
            logger.info(`⚠️ [MOCK] Translation Result for Chunk ${index}:`, translatedItems);
          } else {
            translatedItems = await translateBatch(
              ai,
              toTranslate,
              translateSystemInstruction,
              1, // Internal concurrency (we're already in refinementSemaphore)
              chunkSettings.translationBatchSize || 20,
              (update) =>
                onProgress?.({
                  id: index,
                  total: totalChunks,
                  status: 'processing',
                  stage: 'translating',
                  ...update,
                }),
              signal,
              trackUsage,
              (settings.requestTimeout || 600) * 1000 // Custom timeout in milliseconds
            );
          }
          logger.debug(`[Chunk ${index}] Translation complete. Items: ${translatedItems.length}`);
          if (translatedItems.length > 0 && chunkSettings.enableDiarization) {
            logger.debug(
              `[Chunk ${index}] Translation first segment speaker: ${translatedItems[0].speaker}`
            );
          }

          finalChunkSubs = translatedItems.map((item) => ({
            id: item.id,
            startTime: formatTime(timeToSeconds(item.start) + start),
            endTime: formatTime(timeToSeconds(item.end) + start),
            original: item.original,
            translated: item.translated,
            speaker: item.speaker,
          }));
        }

        chunkResults[i] = finalChunkSubs;

        // Update Intermediate Result
        const currentAll = chunkResults.flat();
        onIntermediateResult?.(currentAll);

        onProgress?.({ id: index, total: totalChunks, status: 'completed', message: '完成' });
      } finally {
        refinementSemaphore.release();
      }
    } catch (e: any) {
      logger.error(`Chunk ${index} failed`, e);
      const actionableMsg = getActionableErrorMessage(e);
      const errorMsg = actionableMsg || '失败';
      onProgress?.({ id: index, total: totalChunks, status: 'error', message: errorMsg });
    }
  });

  const finalSubtitles = chunkResults.flat();

  // Log Token Usage Report
  let reportLog = '\n📊 Token Usage Report:\n----------------------------------------\n';
  let grandTotal = 0;
  let totalCost = 0;

  for (const [model, usage] of Object.entries(usageReport)) {
    const cost = calculateDetailedCost({
      textInputTokens: usage.textInput,
      audioInputTokens: usage.audioInput,
      candidatesTokens: usage.output,
      thoughtsTokens: usage.thoughts,
      modelName: model,
    });
    totalCost += cost;

    reportLog += `Model: ${model}\n`;
    reportLog += `  - Text Input: ${usage.textInput.toLocaleString()}\n`;
    reportLog += `  - Audio Input: ${usage.audioInput.toLocaleString()}\n`;
    reportLog += `  - Output: ${usage.output.toLocaleString()}\n`;
    reportLog += `  - Thoughts: ${usage.thoughts.toLocaleString()}\n`;
    reportLog += `  - Total: ${usage.total.toLocaleString()}\n`;
    reportLog += `  - Est. Cost: $${cost.toFixed(6)}\n`;
    reportLog += `----------------------------------------\n`;
    grandTotal += usage.total;
  }
  reportLog += `Grand Total Tokens: ${grandTotal.toLocaleString()}\n`;
  reportLog += `Total Est. Cost: $${totalCost.toFixed(6)}\n`;
  logger.info(reportLog);

  return { subtitles: finalSubtitles, glossaryResults: extractedGlossaryResults };
};

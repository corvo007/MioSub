import { GoogleGenAI } from '@google/genai';
import { MockFactory } from '@/services/api/gemini/debug/mockFactory';
import { ArtifactSaver } from '@/services/api/gemini/debug/artifactSaver';
import { UsageReporter } from '@/services/api/gemini/pipeline/usageReporter';
import { preprocessAudio } from '@/services/api/gemini/pipeline/preprocessor';
import { SpeakerAnalyzer } from '@/services/api/gemini/pipeline/speakerAnalyzer';
import { GlossaryHandler } from '@/services/api/gemini/pipeline/glossaryHandler';
import { PipelineContext } from '@/services/api/gemini/pipeline/types';
import { SubtitleItem } from '@/types/subtitle';
import { AppSettings } from '@/types/settings';
import { ChunkStatus } from '@/types/api';
import {
  GlossaryItem,
  GlossaryExtractionResult,
  GlossaryExtractionMetadata,
} from '@/types/glossary';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';
import { selectChunksByDuration } from '@/services/glossary/selector';
import { extractGlossaryFromAudio } from '@/services/api/gemini/glossary';
import { GlossaryState } from '@/services/api/gemini/glossary-state';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { transcribeAudio } from '@/services/api/openai/transcribe';
import { blobToBase64 } from '@/services/audio/converter';
import { SpeakerProfile } from '@/services/api/gemini/speakerProfile';
import {
  getSystemInstruction,
  getSystemInstructionWithDiarization,
  getRefinementPrompt,
} from '@/services/api/gemini/prompts';
import { parseGeminiResponse, cleanNonSpeechAnnotations } from '@/services/subtitle/parser';
import {
  withPostCheck,
  postProcessRefinement,
  postProcessTranslation,
} from '@/services/subtitle/postCheck';
import { mapInParallel, Semaphore } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
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
import { STEP_MODELS, buildStepConfig, ENV } from '@/config';

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

  // Token Usage Tracking
  const usageReporter = new UsageReporter();
  const trackUsage = usageReporter.getTracker();
  const isDebug = window.electronAPI?.isDebug ?? false;

  const context: PipelineContext = {
    ai,
    settings,
    signal,
    trackUsage,
    onProgress,
    isDebug,
    geminiKey,
    openaiKey,
  };

  // Preprocess: Decode audio and segment into chunks
  const { audioBuffer, chunksParams, vadSegments, chunkDuration } = await preprocessAudio(
    audioSource,
    settings,
    onProgress,
    signal
  );
  const totalChunks = chunksParams.length;

  // Intermediate results storage for full recording
  const whisperChunksMap = new Map<number, SubtitleItem[]>();
  const refinedChunksMap = new Map<number, SubtitleItem[]>();
  const translatedChunksMap = new Map<number, SubtitleItem[]>();

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

  if (isDebug && settings.debug?.mockGemini) {
    logger.info('⚠️ [MOCK] Glossary Extraction ENABLED. Using MockFactory.');
    glossaryPromise = MockFactory.getMockGlossary(0);
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

  // --- GLOSSARY HANDLING ---
  const glossaryTask = GlossaryHandler.handle(
    context,
    glossaryPromise,
    glossaryChunks,
    onGlossaryReady
  );

  // Wrap promise for non-blocking access by chunks
  const glossaryState = new GlossaryState(glossaryTask.then((r) => r.glossary));
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

    speakerProfilePromise = SpeakerAnalyzer.analyze(context, audioBuffer, vadSegments);
  }

  // DEBUG: Save Speaker Profile Artifact
  if (
    settings.debug?.saveIntermediateArtifacts &&
    window.electronAPI?.saveDebugArtifact &&
    speakerProfilePromise
  ) {
    speakerProfilePromise.then((profiles) => ArtifactSaver.saveSpeakerProfiles(profiles, settings));
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
          rawSegments = await MockFactory.getMockTranscription(index, start, end);
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

      ArtifactSaver.saveChunkArtifact(index, 'whisper', rawSegments, settings);
      // Collect intermediate result
      whisperChunksMap.set(
        index,
        rawSegments.map((seg) => ({
          ...seg,
          startTime: formatTime(timeToSeconds(seg.startTime) + start),
          endTime: formatTime(timeToSeconds(seg.endTime) + start),
        }))
      ); // Adjust time to global for full SRT

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
          message: '等待说话人预分析...',
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
            refinedSegments = await MockFactory.getMockRefinement(index, rawSegments);
          } else {
            // ===== POST-CHECK PIPELINE (Generate + Validate + Retry if needed) =====
            const { result: processedSegments, checkResult } = await withPostCheck(
              async () => {
                // Generate refinement content
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
                      responseMimeType: 'application/json',
                      responseSchema: chunkSettings.enableDiarization
                        ? REFINEMENT_WITH_DIARIZATION_SCHEMA
                        : REFINEMENT_SCHEMA,
                      systemInstruction: refineSystemInstruction,
                      safetySettings: SAFETY_SETTINGS,
                      ...buildStepConfig('refinement'),
                    },
                  },
                  3,
                  signal,
                  trackUsage,
                  (settings.requestTimeout || 600) * 1000
                );
                return parseGeminiResponse(response.text, chunkDuration);
              },
              postProcessRefinement,
              { maxRetries: 1, stepName: `[Chunk ${index}]` }
            );

            // Use the post-processed result (markers already applied by postCheck)
            refinedSegments = processedSegments;
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

        ArtifactSaver.saveChunkArtifact(index, 'refinement', refinedSegments, settings);
        // Collect intermediate result
        refinedChunksMap.set(
          index,
          refinedSegments.map((seg) => ({
            ...seg,
            startTime: formatTime(timeToSeconds(seg.startTime) + start),
            endTime: formatTime(timeToSeconds(seg.endTime) + start),
          }))
        ); // Adjust time to global

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
            ...(chunkSettings.enableDiarization && seg.speaker ? { speaker: seg.speaker } : {}),
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
            translatedItems = await MockFactory.getMockTranslation(index, toTranslate);

            finalChunkSubs = translatedItems.map((item) => ({
              id: item.id,
              startTime: formatTime(timeToSeconds(item.start) + start),
              endTime: formatTime(timeToSeconds(item.end) + start),
              original: item.original,
              translated: item.translated,
              ...(chunkSettings.enableDiarization && item.speaker ? { speaker: item.speaker } : {}),
            }));
          } else {
            // ===== POST-CHECK PIPELINE (Translate + Validate + Retry if needed) =====
            const { result: checkedSubs } = await withPostCheck(
              async () => {
                // Generate translation
                const items = await translateBatch(
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
                  (settings.requestTimeout || 600) * 1000, // Custom timeout in milliseconds
                  !!chunkSettings.enableDiarization // Pass diarization flag
                );

                logger.debug(`[Chunk ${index}] Translation complete. Items: ${items.length}`);
                if (items.length > 0 && chunkSettings.enableDiarization) {
                  logger.debug(
                    `[Chunk ${index}] Translation first segment speaker: ${items[0].speaker}`
                  );
                }

                // Transform to SubtitleItem format
                return items.map((item) => ({
                  id: item.id,
                  startTime: formatTime(timeToSeconds(item.start) + start),
                  endTime: formatTime(timeToSeconds(item.end) + start),
                  original: item.original,
                  translated: item.translated,
                  ...(chunkSettings.enableDiarization && item.speaker
                    ? { speaker: item.speaker }
                    : {}),
                }));
              },
              postProcessTranslation,
              { maxRetries: 1, stepName: `[Chunk ${index}]` }
            );

            finalChunkSubs = checkedSubs;
          }
        }

        ArtifactSaver.saveChunkArtifact(index, 'translation', finalChunkSubs, settings);
        // Collect intermediate result
        translatedChunksMap.set(index, finalChunkSubs);

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

  usageReporter.logReport();

  await ArtifactSaver.saveFullIntermediateSrts(
    whisperChunksMap,
    refinedChunksMap,
    translatedChunksMap,
    settings
  );

  return { subtitles: finalSubtitles, glossaryResults: (await glossaryTask).raw };
};

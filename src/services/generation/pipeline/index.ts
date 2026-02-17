import { MockFactory } from '@/services/generation/debug/mockFactory';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { preprocessAudio } from './preprocessor';
import { SmartSegmenter } from '@/services/audio/segmenter';
import { SpeakerAnalyzer } from './speakerAnalyzer';
import { GlossaryHandler } from './glossaryHandler';
import { initializePipelineContext, calculateMainLoopConcurrency } from './pipelineCore';
import { type VideoInfo } from '@/types/pipeline';
import { type SubtitleItem } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { selectChunksByDuration } from '@/services/glossary/selector';
import { extractGlossaryFromAudio } from '@/services/generation/extractors/glossary';
import { GlossaryState } from '@/services/generation/extractors/glossaryState';
import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import { mapInParallel } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import { ChunkProcessor } from './chunkProcessor';
import { type ChunkAnalytics } from '@/types/api';
import { type TokenUsageAnalytics } from './usageReporter';
import { timeToSeconds } from '@/services/subtitle/time';
import { type SpeakerUIProfile } from '@/types/speaker';
import { normalizeSubtitles } from '@/services/speaker/normalizer';
import i18n from '@/i18n';

export const generateSubtitles = async (
  audioSource: File | AudioBuffer,
  duration: number,
  settings: AppSettings,
  onProgress?: (update: ChunkStatus) => void,
  onIntermediateResult?: (subs: SubtitleItem[]) => void,
  onGlossaryReady?: (metadata: GlossaryExtractionMetadata) => Promise<GlossaryItem[]>,
  signal?: AbortSignal,
  videoInfo?: VideoInfo,
  existingProfiles: SpeakerUIProfile[] = [],
  videoPath?: string // Optional video path for long video on-demand extraction
): Promise<{
  subtitles: SubtitleItem[];
  speakerProfiles: SpeakerUIProfile[];
  glossaryResults?: GlossaryExtractionResult[];
  chunkAnalytics: ChunkAnalytics[];
  tokenUsage: TokenUsageAnalytics;
}> => {
  // Initialize pipeline context using shared core
  const { context, usageReporter, trackUsage, semaphores, concurrency } = initializePipelineContext(
    {
      settings,
      onProgress,
      signal,
      videoInfo,
    }
  );

  const { ai, isDebug } = context;

  // Check if we can skip audio preprocessing (decoding/segmentation)
  // This is possible if we are starting from a later stage (Mock Stage) AND NO subsequent stage needs audio.
  const isMockStageActive = !!(isDebug && settings.debug?.mockStage);
  const skipAfter = settings.debug?.skipAfter;

  // Dependency Checks
  // 1. Glossary needs audio if enabled and not mocked
  const needsGlossary =
    settings.enableAutoGlossary !== false && !(isDebug && settings.debug?.mockApi?.glossary);

  // 2. Speaker needs audio if enabled and not mocked
  const needsSpeaker =
    settings.enableDiarization &&
    settings.enableSpeakerPreAnalysis &&
    !(isDebug && settings.debug?.mockApi?.speaker);

  // 3. Refinement needs audio if it runs (not skipped, not mocked, not bypassed by later start)
  const mockStageIndex = settings.debug?.mockStage
    ? ['transcribe', 'refinement', 'alignment', 'translation'].indexOf(settings.debug.mockStage)
    : -1;
  const stopsBeforeRefinement = skipAfter === 'transcribe';
  const startsAfterRefinement = mockStageIndex > 1; // 0=transcribe, 1=refinement. >1 means alignment/translation
  const needsRefinement =
    !stopsBeforeRefinement &&
    !startsAfterRefinement &&
    !(isDebug && settings.debug?.mockApi?.refinement);

  // 4. Alignment needs audio if it runs (not skipped, not mocked, not bypassed by later start)
  const stopsBeforeAlignment = skipAfter === 'transcribe' || skipAfter === 'refinement';
  const startsAfterAlignment = mockStageIndex > 2; // 2=alignment. >2 means translation
  const needsAlignment =
    !stopsBeforeAlignment &&
    !startsAfterAlignment &&
    !(isDebug && settings.debug?.mockApi?.alignment);

  const shouldSkipAudioProcessing =
    isMockStageActive && !needsGlossary && !needsSpeaker && !needsRefinement && !needsAlignment;

  let audioBuffer: AudioBuffer;
  let chunksParams: any[]; // Using explicit type locally from preprocessor/index if imported, or inference
  let vadSegments: any[];
  let chunkDuration: number;
  let isLongVideoMode = false; // Flag for long video on-demand extraction
  let longVideoPath: string | undefined; // Video path for long video extraction

  if (shouldSkipAudioProcessing) {
    logger.info('🚀 [OPTIMIZATION] Skipping Audio Processing (Decoding/Segmentation).');
    logger.info(
      '   Reason: Started from Mock Stage and all audio-dependent downstream stages (Glossary, Speaker, Alignment) are Mocked or Skipped.'
    );

    // Create Dummy Audio Buffer
    audioBuffer = new AudioBuffer({ length: 1, sampleRate: 16000, numberOfChannels: 1 });
    // Create Single Dummy Chunk (Mock mode only processes chunk index 1)
    chunkDuration = 3600; // 1 hour dummy duration (seconds)
    chunksParams = [{ index: 1, start: 0, end: chunkDuration }];
    vadSegments = [];

    onProgress?.({
      id: 'decoding',
      total: 100,
      status: 'completed',
      message: i18n.t('services:pipeline.status.audioLoaded'), // Reuse existing message or 'Audio Skipped'
    });
  } else {
    // Preprocess: Decode audio and segment into chunks
    const result = await preprocessAudio(audioSource, settings, onProgress, signal, videoPath);
    audioBuffer = result.audioBuffer;
    chunksParams = result.chunksParams;
    vadSegments = result.vadSegments;
    chunkDuration = result.chunkDuration;
    // Store long video info for chunk processing
    isLongVideoMode = result.isLongVideo;
    longVideoPath = result.videoPath;
  }
  const totalChunks = chunksParams.length;

  // Intermediate results storage for full recording
  const whisperChunksMap = new Map<number, SubtitleItem[]>();
  const refinedChunksMap = new Map<number, SubtitleItem[]>();
  const alignedChunksMap = new Map<number, SubtitleItem[]>();
  const translatedChunksMap = new Map<number, SubtitleItem[]>();

  // Use semaphores from pipelineCore
  const {
    transcription: transcriptionSemaphore,
    refinement: refinementSemaphore,
    alignment: alignmentSemaphore,
  } = semaphores;

  logger.info(
    `Pipeline Config: Overall Concurrency=${concurrency.pipeline}, Transcription Limit=${concurrency.transcription}, Alignment Limit=${concurrency.local}`
  );

  // --- GLOSSARY EXTRACTION (Parallel) ---
  let glossaryPromise: Promise<GlossaryExtractionResult[]> | null = null;
  let glossaryChunks: { index: number; start: number; end: number }[] | undefined;

  const isLateStart = mockStageIndex >= 1; // Refinement or later

  // Determine if we should mock glossary
  // 1. Explicitly enabled in settings
  // 2. Implicitly enabled if starting late (mock mode), unless explicitly disabled (false)
  const shouldMockGlossary =
    isDebug &&
    (settings.debug?.mockApi?.glossary ||
      (isLateStart && settings.debug?.mockApi?.glossary !== false));

  // Mock glossary if needed (but only if glossary is generally enabled)
  if (shouldMockGlossary && settings.enableAutoGlossary !== false) {
    logger.info('⚠️ [MOCK] Glossary Extraction ENABLED. Using MockFactory.');
    glossaryPromise = MockFactory.getMockGlossary(0);
  } else if (settings.enableAutoGlossary !== false) {
    // Check if we have a valid audio source (either audioBuffer or videoPath for long video mode)
    const hasAudioSource = audioBuffer || (isLongVideoMode && longVideoPath);

    if (!hasAudioSource) {
      logger.info('Skipping glossary extraction: No audio source available');
      onProgress?.({
        id: 'glossary',
        total: 1,
        status: 'completed',
        message: i18n.t('services:pipeline.status.extractingGlossaryComplete'),
      });
      glossaryPromise = Promise.resolve([]);
    } else {
      const sampleMinutes = settings.glossarySampleMinutes || 'all';
      glossaryChunks = selectChunksByDuration(chunksParams, sampleMinutes, chunkDuration);

      logger.info(
        `Initiating parallel glossary extraction on ${glossaryChunks.length} chunks (Limit: ${sampleMinutes} min)${isLongVideoMode ? ' [Long Video Mode]' : ''}`
      );

      // Use Pro concurrency setting for glossary (Gemini 3 Pro)
      // Use lower concurrency for long video mode to avoid FFmpeg overload
      const glossaryConcurrency = isLongVideoMode
        ? Math.min(settings.concurrencyPro || 2, 2)
        : settings.concurrencyPro || 2;

      onProgress?.({
        id: 'glossary',
        total: glossaryChunks.length,
        status: 'processing',
        message: i18n.t('services:pipeline.status.extractingGlossaryInit', {
          total: glossaryChunks.length,
        }),
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
              completed === total
                ? i18n.t('services:pipeline.status.extractingGlossaryComplete')
                : i18n.t('services:pipeline.status.extractingGlossary', {
                    current: completed,
                    total,
                  }),
          });
        },
        signal,
        trackUsage,
        (settings.requestTimeout || 600) * 1000, // Custom timeout in milliseconds
        settings.targetLanguage,
        // Long video mode parameters
        isLongVideoMode,
        longVideoPath
      );
    }
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

  // Determine if we should mock speaker analysis
  // 1. Explicitly enabled in settings
  // 2. Implicitly enabled if starting late, unless explicitly disabled
  const shouldMockSpeaker =
    isDebug &&
    (settings.debug?.mockApi?.speaker ||
      (isLateStart && settings.debug?.mockApi?.speaker !== false));

  if (shouldMockSpeaker && settings.enableDiarization && settings.enableSpeakerPreAnalysis) {
    logger.info('⚠️ [MOCK] Speaker Profile Analysis ENABLED. Using MockFactory.');
    speakerProfilePromise = MockFactory.getMockSpeakerProfiles();
  } else if (settings.enableDiarization && settings.enableSpeakerPreAnalysis) {
    // Long video mode: use fixed-interval sampling with FFmpeg
    if (isLongVideoMode && longVideoPath) {
      logger.info('Starting speaker profile extraction (long video mode)...');
      speakerProfilePromise = SpeakerAnalyzer.analyze(context, null, vadSegments, {
        isLongVideo: true,
        videoPath: longVideoPath,
        totalDuration: duration,
      });
    } else if (audioBuffer) {
      // Standard mode: use intelligent sampling with in-memory buffer
      speakerProfilePromise = SpeakerAnalyzer.analyze(context, audioBuffer, vadSegments);
    } else {
      // No audio source available
      logger.info('Skipping speaker profile extraction: No audio source available');
      onProgress?.({
        id: 'diarization',
        total: 1,
        status: 'completed',
        message: i18n.t('services:pipeline.status.speakersIdentified', { count: 0 }),
      });
      speakerProfilePromise = Promise.resolve([]);
    }
  }

  // DEBUG: Save Speaker Profile Artifact
  if (
    settings.debug?.saveIntermediateArtifacts &&
    window.electronAPI?.saveDebugArtifact &&
    speakerProfilePromise !== null
  ) {
    void speakerProfilePromise.then((profiles) =>
      ArtifactSaver.saveSpeakerProfiles(profiles, settings)
    );
  }

  // --- UNIFIED PARALLEL PIPELINE: Transcription → Wait for Glossary/Profiles → Refine & Translate ---
  // Each chunk proceeds independently without waiting for others
  logger.info('Starting Unified Pipeline: Each chunk will proceed independently');

  // Ensure independent array references for each slot
  const chunkResults: SubtitleItem[][] = Array.from({ length: totalChunks }, () => []);

  // Incremental accumulation for intermediate results (avoids O(N²) .flat() calls)
  // This array grows incrementally as chunks complete, avoiding repeated full-array allocations
  const intermediateResults: SubtitleItem[] = [];

  // Accumulator for chunk analytics
  const chunkAnalytics: ChunkAnalytics[] = [];

  // Use a high concurrency limit for the main loop (buffer)
  // The actual resource usage is controlled by semaphores inside
  // We use a reasonable upper bound to prevent excessive Promise creation for long videos
  // while still allowing enough concurrency for the pipeline to work efficiently.
  // Cap at 50 to balance memory usage vs pipeline throughput.
  const mainLoopConcurrency = calculateMainLoopConcurrency(totalChunks, concurrency.pipeline);

  // Error collector to track failures across chunks
  const chunkErrors: Error[] = [];

  await mapInParallel(chunksParams, mainLoopConcurrency, async (chunk, i) => {
    try {
      // Delegate processing to ChunkProcessor
      const result = await ChunkProcessor.process(chunk, context, {
        glossaryState,
        speakerProfilePromise,
        transcriptionSemaphore,
        refinementSemaphore,
        alignmentSemaphore,
        audioBuffer,
        videoPath: longVideoPath,
        isLongVideo: isLongVideoMode,
        chunkDuration,
        totalChunks,
      });

      // Update maps for artifact saving
      if (result.whisper.length > 0) whisperChunksMap.set(chunk.index, result.whisper);
      if (result.refined.length > 0) refinedChunksMap.set(chunk.index, result.refined);
      if (result.aligned.length > 0) alignedChunksMap.set(chunk.index, result.aligned);
      if (result.translated.length > 0) translatedChunksMap.set(chunk.index, result.translated);

      // Store final result (Uses 'final' which includes fallback logic: Translated > Refined > Whisper)
      // This ensures that if translation fails, we at least fallback to the corrected original text.
      chunkResults[i] = result.final;

      // Incremental update - push new results instead of O(N²) .flat() on every chunk
      if (result.final.length > 0) {
        intermediateResults.push(...result.final);
        // Sort by start time (Timsort is efficient on nearly-sorted data)
        intermediateResults.sort((a, b) => timeToSeconds(a.startTime) - timeToSeconds(b.startTime));
        // Pass a copy to prevent external mutation of our accumulator
        onIntermediateResult?.([...intermediateResults]);
      }

      // Collect analytics for this chunk (for return value sorting)
      // Note: Analytics are also reported incrementally via onProgress for error/cancel robustness
      chunkAnalytics.push(result.analytics);
    } catch (e: any) {
      // Check for cancellation
      if (
        context.signal?.aborted ||
        e.message === i18n.t('services:pipeline.errors.cancelled') ||
        e.name === 'AbortError'
      ) {
        throw e;
      }

      // Capture error for potential final reporting
      chunkErrors.push(e);

      // Should already be handled in ChunkProcessor, but safety net
      logger.error(`Unexpected error in Chunk ${chunk.index}`, e);
    }
  });

  const finalSubtitles = chunkResults.flat();

  // ERROR CHECK: If we have NO subtitles but DID have errors, it means the pipeline failed completely.
  // We should throw the first error to give the user a useful message (e.g., "Whisper binary not found")
  // instead of the generic "No subtitles generated" which happens later.
  if (finalSubtitles.length === 0 && chunkErrors.length > 0) {
    logger.error('Pipeline produced no subtitles and encountered errors. Rethrowing first error.');
    throw chunkErrors[0];
  }

  usageReporter.logReport();
  const tokenUsage = usageReporter.getAnalyticsSummary();

  await ArtifactSaver.saveFullIntermediateSrts(
    whisperChunksMap,
    refinedChunksMap,
    alignedChunksMap,
    translatedChunksMap,
    settings,
    { videoInfo, totalChunks: totalChunks }
  );

  // Cleanup: Dispose SmartSegmenter singleton to free VAD Worker resources
  SmartSegmenter.disposeInstance();

  // Ensure deterministic order for analytics
  chunkAnalytics.sort((a, b) => a.index - b.index);

  // Normalize final subtitles (Hydrate IDs)
  // This ensures that even if we had speaker names, we now have proper IDs
  const { subtitles: normalizedSubtitles, profiles: updatedProfiles } = normalizeSubtitles(
    finalSubtitles,
    existingProfiles,
    { generateNewProfiles: true }
  );

  return {
    subtitles: normalizedSubtitles,
    speakerProfiles: updatedProfiles,
    glossaryResults: (await glossaryTask).raw,
    chunkAnalytics,
    tokenUsage,
  };
};

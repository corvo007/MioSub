import { GoogleGenAI } from '@google/genai';
import { MockFactory } from '@/services/generation/debug/mockFactory';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { UsageReporter } from './usageReporter';
import { preprocessAudio } from './preprocessor';
import { SmartSegmenter } from '@/services/audio/segmenter';
import { SpeakerAnalyzer } from './speakerAnalyzer';
import { GlossaryHandler } from './glossaryHandler';
import { type PipelineContext } from '@/types/pipeline';
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
import { mapInParallel, Semaphore } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import { ChunkProcessor } from './chunkProcessor';
import { ENV } from '@/config';
import i18n from '@/i18n';

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

  if (!geminiKey) throw new Error(i18n.t('services:pipeline.errors.missingGeminiKey'));
  if (!openaiKey && !settings.useLocalWhisper)
    throw new Error(i18n.t('services:pipeline.errors.missingOpenAIKey'));

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
    const result = await preprocessAudio(audioSource, settings, onProgress, signal);
    audioBuffer = result.audioBuffer;
    chunksParams = result.chunksParams;
    vadSegments = result.vadSegments;
    chunkDuration = result.chunkDuration;
  }
  const totalChunks = chunksParams.length;

  // Intermediate results storage for full recording
  const whisperChunksMap = new Map<number, SubtitleItem[]>();
  const refinedChunksMap = new Map<number, SubtitleItem[]>();
  const alignedChunksMap = new Map<number, SubtitleItem[]>();
  const translatedChunksMap = new Map<number, SubtitleItem[]>();

  // PIPELINE CONCURRENCY CONFIGURATION
  // We separate the "Transcription" concurrency from the "Overall Pipeline" concurrency.
  // This allows chunks to proceed to Refinement/Translation (which use Gemini)
  // even if the Transcription slot (Local Whisper) is busy or waiting.

  // 1. Overall Pipeline Concurrency (Gemini Flash limit)
  const pipelineConcurrency = settings.concurrencyFlash || 5;

  // 2. Transcription Concurrency (Local Whisper limit or Cloud limit)
  const transcriptionLimit = settings.useLocalWhisper
    ? settings.localConcurrency || 1 // Use local concurrency for Local Whisper (heavy cpu)
    : pipelineConcurrency; // For cloud whisper, we can match pipeline concurrency

  const transcriptionSemaphore = new Semaphore(transcriptionLimit);
  const refinementSemaphore = new Semaphore(pipelineConcurrency);

  // 3. Alignment Concurrency (Heavy Local Process)
  // Limit to 1 or 2 to avoid memory spike (each aligned uses PyTorch + Model)
  const localConcurrency = settings.localConcurrency || 1;
  const alignmentSemaphore = new Semaphore(localConcurrency);

  logger.info(
    `Pipeline Config: Overall Concurrency=${pipelineConcurrency}, Transcription Limit=${transcriptionLimit}, Alignment Limit=${localConcurrency}`
  );

  // --- GLOSSARY EXTRACTION (Parallel) ---
  let glossaryPromise: Promise<GlossaryExtractionResult[]> | null = null;
  let glossaryChunks: { index: number; start: number; end: number }[] | undefined;

  // Mock glossary if any mock stage is enabled (but only if glossary is enabled)
  if (isDebug && settings.debug?.mockApi?.glossary && settings.enableAutoGlossary !== false) {
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
      settings.targetLanguage
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
      message: i18n.t('services:pipeline.status.analyzingSpeakers'),
    });

    speakerProfilePromise = SpeakerAnalyzer.analyze(context, audioBuffer, vadSegments);
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

  // Use a high concurrency limit for the main loop (buffer)
  // The actual resource usage is controlled by semaphores inside
  // We use a reasonable upper bound to prevent excessive Promise creation for long videos
  // while still allowing enough concurrency for the pipeline to work efficiently.
  // Cap at 50 to balance memory usage vs pipeline throughput.
  const mainLoopConcurrency = Math.min(Math.max(totalChunks, pipelineConcurrency, 20), 50);

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

      // Update total intermediate result
      const currentAll = chunkResults.flat();
      onIntermediateResult?.(currentAll);
    } catch (e: any) {
      // Should already be handled in ChunkProcessor, but safety net
      logger.error(`Unexpected error in Chunk ${chunk.index}`, e);
    }
  });

  const finalSubtitles = chunkResults.flat();

  usageReporter.logReport();

  await ArtifactSaver.saveFullIntermediateSrts(
    whisperChunksMap,
    refinedChunksMap,
    alignedChunksMap,
    translatedChunksMap,
    settings
  );

  // Cleanup: Dispose SmartSegmenter singleton to free VAD Worker resources
  SmartSegmenter.disposeInstance();

  return { subtitles: finalSubtitles, glossaryResults: (await glossaryTask).raw };
};

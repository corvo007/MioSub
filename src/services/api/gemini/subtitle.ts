import { GoogleGenAI } from '@google/genai';
import { MockFactory } from '@/services/api/gemini/debug/mockFactory';
import { ArtifactSaver } from '@/services/api/gemini/debug/artifactSaver';
import { UsageReporter } from '@/services/api/gemini/pipeline/usageReporter';
import { preprocessAudio } from '@/services/api/gemini/pipeline/preprocessor';
import { SpeakerAnalyzer } from '@/services/api/gemini/pipeline/speakerAnalyzer';
import { GlossaryHandler } from '@/services/api/gemini/pipeline/glossaryHandler';
import { type PipelineContext } from '@/services/api/gemini/pipeline/types';
import { type SubtitleItem } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { selectChunksByDuration } from '@/services/glossary/selector';
import { extractGlossaryFromAudio } from '@/services/api/gemini/glossary';
import { GlossaryState } from '@/services/api/gemini/glossary-state';
import { type SpeakerProfile } from '@/services/api/gemini/speakerProfile';
import { mapInParallel, Semaphore } from '@/services/utils/concurrency';
import { logger } from '@/services/utils/logger';
import { ChunkProcessor } from '@/services/api/gemini/pipeline/chunkProcessor';
import { ENV } from '@/config';

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
    speakerProfilePromise !== null
  ) {
    void speakerProfilePromise.then((profiles) =>
      ArtifactSaver.saveSpeakerProfiles(profiles, settings)
    );
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
    try {
      // Delegate processing to ChunkProcessor
      const result = await ChunkProcessor.process(chunk, context, {
        glossaryState,
        speakerProfilePromise,
        transcriptionSemaphore,
        refinementSemaphore,
        audioBuffer,
        chunkDuration,
        totalChunks,
      });

      // Update maps for artifact saving
      if (result.whisper.length > 0) whisperChunksMap.set(chunk.index, result.whisper);
      if (result.refined.length > 0) refinedChunksMap.set(chunk.index, result.refined);
      if (result.translated.length > 0) translatedChunksMap.set(chunk.index, result.translated);

      // Store final result (Translated by default, fallback handled in processor if needed, but we stick to translated)
      chunkResults[i] = result.translated;

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
    translatedChunksMap,
    settings
  );

  return { subtitles: finalSubtitles, glossaryResults: (await glossaryTask).raw };
};

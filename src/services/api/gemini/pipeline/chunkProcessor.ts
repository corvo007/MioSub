import { type Semaphore } from '@/services/utils/concurrency';
import { type ChunkParams } from './preprocessor';
import { type PipelineContext, type SubtitleItem, type SpeakerProfile } from './types';
import { type GlossaryState } from '../glossary-state';
import { ArtifactSaver } from '../debug/artifactSaver';
import { MockFactory } from '../debug/mockFactory';
import { logger } from '@/services/utils/logger';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { transcribeAudio } from '@/services/api/openai/transcribe';
import { cleanNonSpeechAnnotations } from '@/services/subtitle/parser';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';
import { blobToBase64 } from '@/services/audio/converter';
import {
  getSystemInstruction,
  getSystemInstructionWithDiarization,
  getRefinementPrompt,
} from '../prompts';
import { REFINEMENT_SCHEMA, REFINEMENT_WITH_DIARIZATION_SCHEMA, SAFETY_SETTINGS } from '../schemas';
import { generateContentWithRetry, formatGeminiError, getActionableErrorMessage } from '../client';
import { translateBatch } from '../batch';
import { STEP_MODELS, buildStepConfig } from '@/config';
import { parseGeminiResponse } from '@/services/subtitle/parser';
import {
  withPostCheck,
  postProcessRefinement,
  postProcessTranslation,
} from '@/services/subtitle/postCheck';

export interface ChunkDependencies {
  glossaryState: GlossaryState;
  speakerProfilePromise: Promise<SpeakerProfile[]> | null;
  transcriptionSemaphore: Semaphore;
  refinementSemaphore: Semaphore;
  audioBuffer: AudioBuffer;
  chunkDuration: number;
  totalChunks: number;
}

export interface ChunkResult {
  whisper: SubtitleItem[];
  refined: SubtitleItem[];
  translated: SubtitleItem[];
  final: SubtitleItem[]; // The best available version (translated > refined > whisper)
}

export class ChunkProcessor {
  static async process(
    chunk: ChunkParams,
    context: PipelineContext,
    deps: ChunkDependencies
  ): Promise<ChunkResult> {
    const { index, start, end } = chunk;
    const { ai, settings, signal, trackUsage, onProgress, isDebug, openaiKey } = context;
    const {
      glossaryState,
      speakerProfilePromise,
      transcriptionSemaphore,
      refinementSemaphore,
      audioBuffer,
      chunkDuration,
      totalChunks,
    } = deps;

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

      // Clean non-speech annotations
      rawSegments = rawSegments
        .map((seg) => ({
          ...seg,
          original: cleanNonSpeechAnnotations(seg.original),
        }))
        .filter((seg) => seg.original.length > 0);

      ArtifactSaver.saveChunkArtifact(index, 'whisper', rawSegments, settings);

      // Skip if no segments (after cleaning)
      if (rawSegments.length === 0) {
        logger.warn(`[Chunk ${index}] No speech detected, skipping`);
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: '完成（无内容）',
        });
        return { whisper: [], refined: [], translated: [], final: [] };
      }

      // ===== STEP 2: WAIT FOR GLOSSARY (Non-blocking for other chunks) =====
      onProgress?.({
        id: index,
        total: totalChunks,
        status: 'processing',
        stage: 'waiting_glossary',
        message: '等待术语表...',
      });

      if (signal?.aborted) throw new Error('操作已取消');

      logger.debug(`[Chunk ${index}] Waiting for glossary confirmation...`);
      const finalGlossary = await glossaryState.get();

      if (signal?.aborted) throw new Error('操作已取消');

      const chunkSettings = { ...settings, glossary: finalGlossary };

      logger.debug(
        `[Chunk ${index}] Glossary ready (${finalGlossary.length} terms), proceeding to refinement`
      );

      // Wait for speaker profiles
      let speakerProfiles: SpeakerProfile[] | undefined;
      if (speakerProfilePromise !== null) {
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'processing',
          stage: 'waiting_speakers',
          message: '等待说话人预分析...',
        });
        try {
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
      await refinementSemaphore.acquire();
      let refinedSegments: SubtitleItem[] = [];
      let finalChunkSubs: SubtitleItem[] = [];

      try {
        if (signal?.aborted) throw new Error('操作已取消');

        const refineWavBlob = await sliceAudioBuffer(audioBuffer, start, end);
        const base64Audio = await blobToBase64(refineWavBlob);

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
            const { result: processedSegments } = await withPostCheck(
              async () => {
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

        // ===== STEP 4: TRANSLATION =====
        if (refinedSegments.length > 0) {
          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'processing',
            stage: 'translating',
            message: '正在翻译...',
          });

          const toTranslate = refinedSegments.map((seg) => ({
            id: seg.id,
            original: seg.original,
            start: seg.startTime,
            end: seg.endTime,
            ...(chunkSettings.enableDiarization && seg.speaker ? { speaker: seg.speaker } : {}),
          }));

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

          if (isDebug && settings.debug?.mockGemini) {
            const translatedItems = await MockFactory.getMockTranslation(index, toTranslate);
            finalChunkSubs = translatedItems.map((item: any) => ({
              id: item.id,
              startTime: formatTime(timeToSeconds(item.start) + start),
              endTime: formatTime(timeToSeconds(item.end) + start),
              original: item.original,
              translated: item.translated,
              ...(chunkSettings.enableDiarization && item.speaker ? { speaker: item.speaker } : {}),
            }));
          } else {
            const { result: checkedSubs } = await withPostCheck(
              async () => {
                const items = await translateBatch(
                  ai,
                  toTranslate,
                  translateSystemInstruction,
                  1,
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
                  (settings.requestTimeout || 600) * 1000,
                  !!chunkSettings.enableDiarization
                );
                logger.debug(`[Chunk ${index}] Translation complete. Items: ${items.length}`);
                if (items.length > 0 && chunkSettings.enableDiarization) {
                  logger.debug(
                    `[Chunk ${index}] Translation first segment speaker: ${items[0].speaker}`
                  );
                }
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

        onProgress?.({ id: index, total: totalChunks, status: 'completed', message: '完成' });
      } finally {
        refinementSemaphore.release();
      }

      // Construct Global Time Results
      const refinedGlobal = refinedSegments.map((seg) => ({
        ...seg,
        startTime: formatTime(timeToSeconds(seg.startTime) + start),
        endTime: formatTime(timeToSeconds(seg.endTime) + start),
      }));

      return {
        whisper: rawSegments.map((seg) => ({
          ...seg,
          startTime: formatTime(timeToSeconds(seg.startTime) + start),
          endTime: formatTime(timeToSeconds(seg.endTime) + start),
        })),
        refined: refinedGlobal,
        translated: finalChunkSubs, // Already global
        final:
          finalChunkSubs.length > 0
            ? finalChunkSubs
            : refinedGlobal.length > 0
              ? refinedGlobal
              : [],
      };
    } catch (e: any) {
      logger.error(`Chunk ${index} failed`, e);
      const actionableMsg = getActionableErrorMessage(e);
      const errorMsg = actionableMsg || '失败';
      onProgress?.({ id: index, total: totalChunks, status: 'error', message: errorMsg });

      return { whisper: [], refined: [], translated: [], final: [] };
    }
  }
}

import { type Semaphore } from '@/services/utils/concurrency';
import i18n from '@/i18n';
import { type ChunkParams } from './preprocessor';
import { type PipelineContext, type SpeakerProfile } from '@/types/pipeline';
import { type SubtitleItem } from '@/types/subtitle';
import { type GlossaryState } from '@/services/generation/extractors/glossary-state';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { MockFactory } from '@/services/generation/debug/mockFactory';
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
} from '@/services/api/gemini/core/prompts';
import {
  REFINEMENT_SCHEMA,
  REFINEMENT_WITH_DIARIZATION_SCHEMA,
  SAFETY_SETTINGS,
} from '@/services/api/gemini/core/schemas';
import {
  generateContentWithRetry,
  formatGeminiError,
  getActionableErrorMessage,
} from '@/services/api/gemini/core/client';
import { translateBatch } from '@/services/generation/pipeline/translation';
import { STEP_MODELS, buildStepConfig } from '@/config';
import { parseGeminiResponse } from '@/services/subtitle/parser';
import { withPostCheck } from '@/services/subtitle/postCheck';
import { createRefinementPostProcessor } from '@/services/generation/pipeline/postProcessors';
import { createAligner } from '@/services/alignment';
import { iso639_1To3, detectLanguage } from '@/services/utils/language';

export interface ChunkDependencies {
  glossaryState: GlossaryState;
  speakerProfilePromise: Promise<SpeakerProfile[]> | null;
  transcriptionSemaphore: Semaphore;
  refinementSemaphore: Semaphore;
  alignmentSemaphore: Semaphore;
  audioBuffer: AudioBuffer;
  chunkDuration: number;
  totalChunks: number;
}

export interface ChunkResult {
  whisper: SubtitleItem[];
  refined: SubtitleItem[];
  aligned: SubtitleItem[];
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
    const targetLanguage = settings.targetLanguage || 'Simplified Chinese';
    const {
      glossaryState,
      speakerProfilePromise,
      transcriptionSemaphore,
      refinementSemaphore,
      alignmentSemaphore,
      audioBuffer,
      chunkDuration,
      totalChunks,
    } = deps;

    try {
      // Mock Stage Logic Setup (startAfter semantic):
      // mockStage determines which stage to START from - all stages BEFORE mockStage are completely skipped
      // Example: mockStage='alignment' → skip transcribe & refinement, load mock data, start from alignment
      const mockStageOrder = ['transcribe', 'refinement', 'alignment', 'translation'];
      const currentMockStage = settings.debug?.mockStage;
      const mockStageIndex =
        isDebug && currentMockStage ? mockStageOrder.indexOf(currentMockStage) : -1;

      // Mock mode: Only process the first chunk (index 1), skip others
      // Note: chunk indices are 1-indexed (see preprocessor.ts)
      if (mockStageIndex >= 0 && index > 1) {
        logger.info(`[Chunk ${index}] Mock mode enabled - skipping non-first chunk`);
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.complete'),
        });
        return { whisper: [], refined: [], aligned: [], translated: [], final: [] };
      }

      // ===== LOAD MOCK DATA (if mockStage is set) =====
      // When mockStage is set, load data from file as input for the starting stage
      let mockInputSegments: SubtitleItem[] = [];
      if (mockStageIndex >= 0) {
        logger.info(
          `[Chunk ${index}] Mock mode: Starting from '${currentMockStage}' stage, loading mock data...`
        );
        mockInputSegments = await MockFactory.getMockTranscription(
          index,
          start,
          end,
          settings.debug?.mockDataPath
        );
        logger.info(`[Chunk ${index}] Loaded ${mockInputSegments.length} segments from mock data`);
      }

      let rawSegments: SubtitleItem[] = [];

      // ===== STEP 1: TRANSCRIPTION =====
      // Skip if mockStage >= transcribe (any mock stage means skip transcription)
      if (mockStageIndex >= 0) {
        logger.info(`[Chunk ${index}] Skipping transcription (mockStage='${currentMockStage}')`);
        rawSegments = mockInputSegments;
      } else {
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'processing',
          stage: 'transcribing',
          message: i18n.t('services:pipeline.status.waitingTranscription'),
        });

        // Acquire Transcription Semaphore
        await transcriptionSemaphore.acquire();
        try {
          if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));

          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'processing',
            stage: 'transcribing',
            message: i18n.t('services:pipeline.status.transcribing'),
          });
          logger.debug(`[Chunk ${index}] Starting transcription...`);

          const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
          rawSegments = await transcribeAudio(
            wavBlob,
            openaiKey,
            settings.transcriptionModel,
            settings.openaiEndpoint,
            (settings.requestTimeout || 600) * 1000,
            settings.useLocalWhisper,
            settings.whisperModelPath,
            4, // Hardcoded threads
            signal,
            settings.debug?.whisperPath
          );
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
      }

      // Skip if no segments
      if (rawSegments.length === 0) {
        logger.warn(`[Chunk ${index}] No segments available, skipping`);
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.completeNoContent'),
        });
        return { whisper: [], refined: [], aligned: [], translated: [], final: [] };
      }

      // Skip After: Stop pipeline after transcription if configured
      if (settings.debug?.skipAfter === 'transcribe') {
        logger.info(
          `[Chunk ${index}] skipAfter='transcribe' - stopping pipeline after transcription`
        );
        onProgress?.({
          id: index,
          total: totalChunks,
          status: 'completed',
          message: i18n.t('services:pipeline.status.complete'),
        });
        const transcribedResult = rawSegments.map((seg) => ({
          ...seg,
          startTime: formatTime(timeToSeconds(seg.startTime) + start),
          endTime: formatTime(timeToSeconds(seg.endTime) + start),
        }));
        return {
          whisper: transcribedResult,
          refined: transcribedResult,
          aligned: transcribedResult,
          translated: transcribedResult,
          final: transcribedResult,
        };
      }

      // ===== STEP 2: WAIT FOR GLOSSARY (Non-blocking for other chunks) =====
      onProgress?.({
        id: index,
        total: totalChunks,
        status: 'processing',
        stage: 'waiting_glossary',
        message: i18n.t('services:pipeline.status.waitingGlossary'),
      });

      if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));

      logger.debug(`[Chunk ${index}] Waiting for glossary confirmation...`);
      const finalGlossary = await glossaryState.get();

      if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));

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
          message: i18n.t('services:pipeline.status.waitingSpeakerAnalysis'),
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
          if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));
          logger.warn('Failed to get speaker profiles, proceeding without them', e);
        }
      }

      // ===== STEP 3: REFINEMENT =====
      await refinementSemaphore.acquire();
      let refinedSegments: SubtitleItem[] = [];
      let alignedSegments: SubtitleItem[] = [];
      let finalChunkSubs: SubtitleItem[] = [];
      let base64Audio = '';

      try {
        if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));

        // Skip refinement if mockStage > refinement (startAfter semantic)
        // mockStage=refinement means START FROM refinement, so execute it
        if (mockStageIndex > 1) {
          logger.info(`[Chunk ${index}] Skipping refinement (mockStage='${currentMockStage}')`);
          refinedSegments = mockInputSegments; // Use loaded mock data directly
        } else {
          const refineWavBlob = await sliceAudioBuffer(audioBuffer, start, end);
          base64Audio = await blobToBase64(refineWavBlob);

          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'processing',
            stage: 'refining',
            message: i18n.t('services:pipeline.status.refining'),
          });

          const refineSystemInstruction = getSystemInstructionWithDiarization(
            chunkSettings.genre,
            undefined,
            'refinement',
            chunkSettings.glossary,
            chunkSettings.enableDiarization,
            speakerProfiles,
            chunkSettings.minSpeakers,
            chunkSettings.maxSpeakers,
            targetLanguage
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
            targetLanguage,
          });

          try {
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
              createRefinementPostProcessor(),
              { maxRetries: 1, stepName: `[Chunk ${index}]` }
            );
            refinedSegments = processedSegments;

            if (refinedSegments.length === 0) {
              refinedSegments = [...rawSegments];
            }
            logger.debug(
              `[Chunk ${index}] Refinement complete. Segments: ${refinedSegments.length}`
            );
            if (refinedSegments.length > 0 && chunkSettings.enableDiarization) {
              logger.debug(
                `[Chunk ${index}] Refinement first segment speaker: ${refinedSegments[0].speaker}`
              );
            }
          } catch (e) {
            logger.error(
              i18n.t('services:pipeline.status.refinementFailed', { index }),
              formatGeminiError(e)
            );
            refinedSegments = [...rawSegments];
          }

          ArtifactSaver.saveChunkArtifact(index, 'refinement', refinedSegments, settings);
        }

        // Skip After: Stop pipeline after refinement if configured
        if (settings.debug?.skipAfter === 'refinement') {
          logger.info(
            `[Chunk ${index}] skipAfter='refinement' - stopping pipeline after refinement`
          );
          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'completed',
            message: i18n.t('services:pipeline.status.complete'),
          });
          const refinedResult = refinedSegments.map((seg) => ({
            ...seg,
            startTime: formatTime(timeToSeconds(seg.startTime) + start),
            endTime: formatTime(timeToSeconds(seg.endTime) + start),
          }));
          return {
            whisper: rawSegments,
            refined: refinedResult,
            aligned: refinedResult,
            translated: refinedResult,
            final: refinedResult,
          };
        }

        // ===== STEP 4: ALIGNMENT =====
        alignedSegments = refinedSegments;
        if (settings.alignmentMode && settings.alignmentMode !== 'none') {
          // Acquire alignment semaphore to limit heavy process concurrency
          await alignmentSemaphore.acquire();
          try {
            onProgress?.({
              id: index,
              total: totalChunks,
              status: 'processing',
              stage: 'aligning',
              message: i18n.t('services:pipeline.status.aligning'),
            });

            try {
              // Skip alignment if mockStage > alignment (startAfter semantic)
              // mockStage=alignment means START FROM alignment, so execute it
              logger.debug(
                `[Chunk ${index}] Alignment check: mockStageIndex=${mockStageIndex}, alignmentMode=${settings.alignmentMode}`
              );

              if (mockStageIndex > 2) {
                logger.info(
                  `[Chunk ${index}] Skipping alignment (mockStage='${currentMockStage}')`
                );
                alignedSegments = mockInputSegments; // Use loaded mock data directly
              } else {
                logger.info(
                  `[Chunk ${index}] Starting alignment (mode: ${settings.alignmentMode}, segments: ${refinedSegments.length})`
                );
                const aligner = createAligner(settings);
                // Detect language from segment text
                // Detect language from segment text
                // In mock mode, refinedSegments might be the mock data, use it for detection
                const segmentsForDetection =
                  refinedSegments.length > 0 ? refinedSegments : mockInputSegments;

                let detectedLang = 'en';
                // Check for manual mock language setting first
                if (settings.debug?.mockLanguage && settings.debug.mockLanguage !== 'auto') {
                  detectedLang = settings.debug.mockLanguage;
                  logger.info(`[Chunk ${index}] Using configured mock language: ${detectedLang}`);
                } else {
                  const sampleText = segmentsForDetection
                    .slice(0, 5)
                    .map((s) => s.original)
                    .join(' ');
                  logger.info(`[Chunk ${index}] Language detection sample text: "${sampleText}"`);
                  detectedLang = await detectLanguage(sampleText);
                }

                // Map ISO 639-1 to ISO 639-3 for alignment
                const language = iso639_1To3(detectedLang);
                logger.info(
                  `[Chunk ${index}] Alignment Language: ${detectedLang} → ${language} (Source: ${settings.debug?.mockLanguage ? 'Manual' : 'Auto'}, Segments: ${segmentsForDetection.length})`
                );

                // Prepare audio file for CTC alignment if needed
                let tempAudioPath = '';
                if (settings.alignmentMode === 'ctc') {
                  try {
                    // Reuse audio from refinement step if available, otherwise generate
                    let audioDataForTemp: string | ArrayBuffer;

                    if (base64Audio) {
                      audioDataForTemp = base64Audio;
                    } else {
                      // For CTC, we prefer ArrayBuffer to save memory
                      const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
                      audioDataForTemp = await wavBlob.arrayBuffer();
                    }

                    const result = await window.electronAPI.writeTempAudioFile(
                      audioDataForTemp,
                      'wav'
                    );
                    if (result.success && result.path) {
                      tempAudioPath = result.path;
                    } else {
                      logger.warn(
                        `[Chunk ${index}] Failed to save temp audio for alignment: ${result.error}`
                      );
                    }
                  } catch (err) {
                    logger.error(`[Chunk ${index}] Error preparing audio for alignment:`, err);
                  }
                }

                // Validate requirements before proceeding
                let canAlign = true;
                if (settings.alignmentMode === 'ctc' && !tempAudioPath) {
                  logger.warn(`[Chunk ${index}] Skipping CTC alignment: Failed to write temp file`);
                  canAlign = false;
                }

                if (canAlign) {
                  try {
                    alignedSegments = await aligner.align(
                      refinedSegments,
                      tempAudioPath,
                      language,
                      { ai, signal, trackUsage, genre: chunkSettings.genre },
                      base64Audio
                    );
                  } finally {
                    if (tempAudioPath) {
                      window.electronAPI.cleanupTempAudio(tempAudioPath).catch((e) => {
                        logger.warn(`[Chunk ${index}] Failed to cleanup temp audio:`, e);
                      });
                    }
                  }
                }
              }

              // Log low confidence stats
              const lowConfCount = alignedSegments.filter((s) => s.lowConfidence).length;
              if (lowConfCount > 0) {
                logger.warn(
                  `[Chunk ${index}] Alignment: ${lowConfCount}/${alignedSegments.length} segments have low confidence (<0.7)`
                );
              }
            } catch (e: any) {
              logger.error(`[Chunk ${index}] Alignment failed, using refinement timestamps:`, e);
              // alignedSegments remains refinedSegments (fallback)
            }
            // alignedSegments remains refinedSegments (fallback)
          } finally {
            alignmentSemaphore.release();
          }
        }

        ArtifactSaver.saveChunkArtifact(index, 'alignment', alignedSegments, settings);

        // Skip After: Stop pipeline after alignment if configured
        if (settings.debug?.skipAfter === 'alignment') {
          logger.info(`[Chunk ${index}] skipAfter='alignment' - stopping pipeline after alignment`);
          onProgress?.({
            id: index,
            total: totalChunks,
            status: 'completed',
            message: i18n.t('services:pipeline.status.complete'),
          });
          const alignedResult = alignedSegments.map((seg) => ({
            ...seg,
            startTime: formatTime(timeToSeconds(seg.startTime) + start),
            endTime: formatTime(timeToSeconds(seg.endTime) + start),
          }));
          return {
            whisper: rawSegments,
            refined: refinedSegments,
            aligned: alignedResult,
            translated: alignedResult,
            final: alignedResult,
          };
        }

        // ===== STEP 5: TRANSLATION =====
        if (alignedSegments.length > 0) {
          try {
            onProgress?.({
              id: index,
              total: totalChunks,
              status: 'processing',
              stage: 'translating',
              message: i18n.t('services:pipeline.status.translating'),
            });

            const toTranslate = alignedSegments.map((seg) => ({
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
              profilesForTranslation,
              targetLanguage
            );

            // Skip translation if mockStage > translation (startAfter semantic)
            // mockStage=translation means START FROM translation, so execute it
            if (mockStageIndex > 3) {
              logger.info(
                `[Chunk ${index}] Skipping translation (mockStage='${currentMockStage}')`
              );
              // Use mock data directly as final output
              finalChunkSubs = mockInputSegments.map((item: any) => ({
                id: item.id,
                startTime: formatTime(timeToSeconds(item.startTime || item.start) + start),
                endTime: formatTime(timeToSeconds(item.endTime || item.end) + start),
                original: item.original,
                translated: item.translated || '',
                ...(chunkSettings.enableDiarization && item.speaker
                  ? { speaker: item.speaker }
                  : {}),
                // Preserve alignment metadata if present in mock data
                ...(item.alignmentScore !== undefined
                  ? { alignmentScore: item.alignmentScore }
                  : {}),
                ...(item.lowConfidence !== undefined ? { lowConfidence: item.lowConfidence } : {}),
                // Preserve timeline issue markers if present in mock data
                ...(item.hasRegressionIssue !== undefined
                  ? { hasRegressionIssue: item.hasRegressionIssue }
                  : {}),
                ...(item.hasCorruptedRangeIssue !== undefined
                  ? { hasCorruptedRangeIssue: item.hasCorruptedRangeIssue }
                  : {}),
              }));
            } else {
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
                !!chunkSettings.enableDiarization,
                targetLanguage
              );
              logger.debug(`[Chunk ${index}] Translation complete. Items: ${items.length}`);
              if (items.length > 0 && chunkSettings.enableDiarization) {
                logger.debug(
                  `[Chunk ${index}] Translation first segment speaker: ${items[0].speaker}`
                );
              }
              // Build maps to preserve metadata from previous pipeline stages
              const alignedMap = new Map(alignedSegments.map((seg, idx) => [seg.id || idx, seg]));
              // Also need refinedSegments map for timeline issue markers (set in refinement postprocessor)
              const refinedMap = new Map(refinedSegments.map((seg, idx) => [seg.id || idx, seg]));

              finalChunkSubs = items.map((item, idx) => {
                // Look up data from corresponding segments
                const alignedSeg = alignedMap.get(item.id) || alignedSegments[idx];
                const refinedSeg = refinedMap.get(item.id) || refinedSegments[idx];

                return {
                  id: item.id,
                  startTime: formatTime(timeToSeconds(item.start) + start),
                  endTime: formatTime(timeToSeconds(item.end) + start),
                  original: item.original,
                  translated: item.translated,
                  ...(chunkSettings.enableDiarization && item.speaker
                    ? { speaker: item.speaker }
                    : {}),
                  // Preserve alignment metadata from CTC aligner
                  ...(alignedSeg?.alignmentScore !== undefined
                    ? { alignmentScore: alignedSeg.alignmentScore }
                    : {}),
                  ...(alignedSeg?.lowConfidence !== undefined
                    ? { lowConfidence: alignedSeg.lowConfidence }
                    : {}),
                  // Preserve timeline issue markers from refinement postprocessor
                  ...(refinedSeg?.hasRegressionIssue !== undefined
                    ? { hasRegressionIssue: refinedSeg.hasRegressionIssue }
                    : {}),
                  ...(refinedSeg?.hasCorruptedRangeIssue !== undefined
                    ? { hasCorruptedRangeIssue: refinedSeg.hasCorruptedRangeIssue }
                    : {}),
                };
              });
            }

            ArtifactSaver.saveChunkArtifact(index, 'translation', finalChunkSubs, settings);

            onProgress?.({
              id: index,
              total: totalChunks,
              status: 'completed',
              message: i18n.t('services:pipeline.status.completed'),
            });
          } catch (e: any) {
            logger.error(
              i18n.t('services:pipeline.errors.translationFailedKeepRefined', { index }),
              formatGeminiError(e)
            );
            onProgress?.({
              id: index,
              total: totalChunks,
              status: 'processing', // Still 'processing' context, but we are done with this chunk basically
              message: i18n.t('services:pipeline.errors.translationFailedUseOriginal'),
            });
            // finalChunkSubs remains empty (or partially filled if we had better granular handling, but here empty)
            // The return statement will pick up refinedSegments as fallback.
          }
        }
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
        aligned: alignedSegments.map((seg) => ({
          ...seg,
          startTime: formatTime(timeToSeconds(seg.startTime) + start),
          endTime: formatTime(timeToSeconds(seg.endTime) + start),
        })),
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
      const errorMsg = actionableMsg || i18n.t('services:pipeline.status.failed');
      onProgress?.({ id: index, total: totalChunks, status: 'error', message: errorMsg });

      return { whisper: [], refined: [], aligned: [], translated: [], final: [] };
    }
  }
}

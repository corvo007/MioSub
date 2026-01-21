/**
 * TranscriptionStep - Handles audio transcription via Whisper API
 */

import { BaseStep } from '@/services/generation/pipeline/core/BaseStep';
import { type StepContext, type StepName } from '@/services/generation/pipeline/core/types';
import { type SubtitleItem } from '@/types/subtitle';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { transcribeAudio } from '@/services/transcribe/openai/transcribe';
import { cleanNonSpeechAnnotations } from '@/services/subtitle/parser';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { MockFactory } from '@/services/generation/debug/mockFactory';
import { logger } from '@/services/utils/logger';

export interface TranscriptionInput {
  // No input needed, uses audioBuffer from deps
}

export class TranscriptionStep extends BaseStep<TranscriptionInput, SubtitleItem[]> {
  name: StepName = 'transcribe';
  stageKey = 'transcribing' as const;

  protected getSemaphore(ctx: StepContext) {
    return ctx.deps.transcriptionSemaphore;
  }

  /**
   * Override: Transcription should be skipped when ANY mockStage is set (mockStageIndex >= 0).
   * This matches the original behavior where mockStage means "start FROM this stage",
   * so everything before it (including transcription for all stages) uses mock data.
   */
  protected shouldSkipByMockStage(ctx: StepContext): boolean {
    // Any mockStage setting means skip real transcription
    return ctx.mockStageIndex >= 0;
  }

  // Note: No loadMockData here - mockApi.transcribe should go through execute
  // so that mock data passes through postProcess (cleanNonSpeechAnnotations).

  protected async execute(_input: TranscriptionInput, ctx: StepContext): Promise<SubtitleItem[]> {
    const { chunk, deps, pipelineContext } = ctx;
    const { settings, signal, openaiKey } = pipelineContext;
    const { audioBuffer } = deps;

    // Mock API: load mock data (will go through postProcess)
    if (settings.debug?.mockApi?.transcribe) {
      logger.info(`[Chunk ${chunk.index}] Mocking Transcription API Call`);
      const mockDataPath = settings.debug?.mockDataPath;
      return MockFactory.getMockTranscription(chunk.index, chunk.start, chunk.end, mockDataPath);
    }

    logger.debug(`[Chunk ${chunk.index}] Starting transcription...`);

    const wavBlob = await sliceAudioBuffer(audioBuffer, chunk.start, chunk.end);
    const rawSegments = await transcribeAudio(
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

    logger.debug(`[Chunk ${chunk.index}] Transcription complete. Segments: ${rawSegments.length}`);
    return rawSegments;
  }

  protected postProcess(output: SubtitleItem[], _ctx: StepContext): SubtitleItem[] {
    // Clean non-speech annotations and filter empty segments
    return output
      .map((seg) => ({
        ...seg,
        original: cleanNonSpeechAnnotations(seg.original),
      }))
      .filter((seg) => seg.original.length > 0);
  }

  protected async saveArtifact(result: SubtitleItem[], ctx: StepContext): Promise<void> {
    ArtifactSaver.saveChunkArtifact(
      ctx.chunk.index,
      'whisper',
      result,
      ctx.pipelineContext.settings
    );
  }
}
